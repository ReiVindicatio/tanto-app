"""この端末にしかない作業の元データを R2 に控える・取り戻す（2026-11-04。手順は docs/setup.md）。

  python3 pipeline/backup.py make                # 控えを作って R2 の backup/<日付>/ へ上げ、一覧を pipeline/backup_manifest.json に書く
  python3 pipeline/backup.py restore             # 新しい端末で取り戻す（audio/ へ展開し、Claude Code のメモリも置く）
  python3 pipeline/backup.py restore --to <DIR>  # 試しに別の場所へ展開する（メモリは置かない）

- 中身：audio/samples_char（絵の原本・候補・元の動画）、audio/samples*、音声の manifest と uploaded（mp3 は R2 の tts/ にあるので入れない）、
  Claude Code のメモリと設定、作業用スクリプト
- 🔴 .secrets/ は入れない（平文の鍵を置かない）
- R2 の backup/ は Worker の /audio/・/special/ のどちらからも読めない（鍵の形を絞っている）ので公開されない。一覧のファイルは名前と sha256 だけ
- wrangler の 1 オブジェクトの上限（315MB）より小さく分ける。PNG と mp4 は縮まないので圧縮しない
"""
from __future__ import annotations

import datetime
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "tantan-audio"
MANIFEST = ROOT / "pipeline" / "backup_manifest.json"
PART = 250 * 1024 * 1024
AUDIO = ["audio/samples_char", "audio/samples", "audio/samples_gemini"]
WORKERS = 3


def memory_dir() -> Path:
    """Claude Code のメモリの場所（作業パスの英数字以外を - にしたフォルダ）"""
    return Path.home() / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(ROOT)) / "memory"


def sha_of(f: Path) -> str:
    h = hashlib.sha256()
    with f.open("rb") as r:
        for block in iter(lambda: r.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def wrangler(*args: str) -> bool:
    return subprocess.run(["npx", "wrangler", "r2", "object", *args, "--remote"], cwd=ROOT / "app", capture_output=True).returncode == 0


def put(job: tuple[Path, str]) -> None:
    f, key = job
    for _ in range(5):  # たまに通信で失敗する
        if wrangler("put", f"{BUCKET}/{key}", "--file", str(f)):
            print(f"  上げた {key}", flush=True)
            return
    raise SystemExit(f"❌ 上げられなかった：{key}")


def home_tar(out: Path, scratch: str = "") -> None:
    """メモリ・設定・作業用スクリプトを 1 つにまとめる（どれも小さい）"""
    with tempfile.TemporaryDirectory() as tmp:
        h = Path(tmp) / "home"
        h.mkdir()
        if memory_dir().exists():
            shutil.copytree(memory_dir(), h / "memory")
        for src, name in [(Path.home() / ".claude" / "settings.json", "claude-settings.json"), (ROOT / ".claude" / "settings.local.json", "settings.local.json")]:
            if src.exists():
                shutil.copy(src, h / name)
        if scratch:
            base = Path(scratch)
            for f in base.rglob("*"):
                rel = f.relative_to(base)
                if f.is_file() and f.suffix in {".py", ".cjs", ".sh", ".ts", ".html", ".json"} and f.stat().st_size < 2_000_000 and rel.parts[0] not in {"venv", "dist-test", "fresh", "restore"}:
                    (h / "scratchpad" / rel).parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy(f, h / "scratchpad" / rel)
        subprocess.run(["tar", "-cf", str(out), "-C", tmp, "home"], check=True)


def make(scratch: str = "") -> None:
    day = datetime.date.today().isoformat()
    with tempfile.TemporaryDirectory(dir=ROOT / "audio") as tmp:
        d = Path(tmp)
        tts = [os.path.relpath(p, ROOT) for name in ("manifest.json", "uploaded.json") for p in glob.glob(str(ROOT / "audio" / "tts" / "*" / name))]
        tar = subprocess.Popen(["tar", "--exclude", ".DS_Store", "--exclude", os.path.basename(tmp), "-cf", "-", "-C", str(ROOT), *AUDIO, *tts], stdout=subprocess.PIPE, env={**os.environ, "COPYFILE_DISABLE": "1"})
        parts = []
        while True:
            chunk = tar.stdout.read(PART)
            if not chunk:
                break
            f = d / f"audio.tar.{len(parts):03d}"
            f.write_bytes(chunk)
            parts.append(f)
            print(f"  作った {f.name}", flush=True)
        if tar.wait() != 0:
            raise SystemExit("❌ tar に失敗した")
        home = d / "home.tar"
        home_tar(home, scratch)
        listing = {"date": day, "audio": [{"name": f.name, "size": f.stat().st_size, "sha256": sha_of(f)} for f in parts], "home": {"name": home.name, "size": home.stat().st_size, "sha256": sha_of(home)}}
        with ThreadPoolExecutor(WORKERS) as ex:
            list(ex.map(put, [(f, f"backup/{day}/{f.name}") for f in [*parts, home]]))
    MANIFEST.write_text(json.dumps(listing, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(p["size"] for p in listing["audio"]) + listing["home"]["size"]
    print(f"✅ {len(parts)} 個＋home を上げた（{total / 1024 / 1024 / 1024:.2f}GB）。{MANIFEST.relative_to(ROOT)} を commit する", flush=True)


def fetch(job: tuple[str, str, Path]) -> None:
    key, sha, f = job
    for _ in range(5):
        if wrangler("get", f"{BUCKET}/{key}", "--file", str(f)) and f.exists() and sha_of(f) == sha:
            print(f"  取った {f.name}", flush=True)
            return
    raise SystemExit(f"❌ 取り戻せなかった（または中身が合わない）：{key}")


def restore(to: str = "") -> None:
    listing = json.loads(MANIFEST.read_text(encoding="utf-8"))
    dest = Path(to).resolve() if to else ROOT
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "audio").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest / "audio") as tmp:
        d = Path(tmp)
        prefix = f"backup/{listing['date']}"
        items = [*listing["audio"], listing["home"]]
        with ThreadPoolExecutor(WORKERS) as ex:
            list(ex.map(fetch, [(f"{prefix}/{p['name']}", p["sha256"], d / p["name"]) for p in items]))
        print("  展開する", flush=True)
        tar = subprocess.Popen(["tar", "-xf", "-", "-C", str(dest)], stdin=subprocess.PIPE)
        for p in listing["audio"]:
            with (d / p["name"]).open("rb") as r:
                shutil.copyfileobj(r, tar.stdin, 1024 * 1024)
            (d / p["name"]).unlink()
        tar.stdin.close()
        if tar.wait() != 0:
            raise SystemExit("❌ 展開に失敗した")
        kept = dest / "audio" / "home-backup"
        kept.mkdir(exist_ok=True)
        subprocess.run(["tar", "-xf", str(d / "home.tar"), "-C", str(kept), "--strip-components", "1"], check=True)
    if not to and not memory_dir().exists():
        shutil.copytree(kept / "memory", memory_dir())
        print(f"  メモリを置いた：{memory_dir()}", flush=True)
    print(f"✅ 取り戻した（{dest / 'audio'}）。設定と作業用スクリプトは {kept}", flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "make":
        make(sys.argv[2] if len(sys.argv) > 2 else "")
    elif sys.argv[1] == "restore":
        restore(sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--to" else "")
    else:
        raise SystemExit(__doc__)
