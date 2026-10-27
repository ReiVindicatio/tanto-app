"""律の衣装を、設計（pipeline/ritsu_costumes.json）から1着ずつ作る（T065）。

  python3 pipeline/ritsu_theme.py looks [ID ...]   # 見本4案・お披露目の一枚絵2案（audio/samples_char/g8/<ID>/）。省くと全部
  python3 pipeline/ritsu_theme.py build ID         # 選んだ見本（設計の pick）から、絵ひとそろい → 切り抜き → セリフと声 → アプリの衣装の表へ
  python3 pipeline/ritsu_theme.py bg               # 設計にある背景のうち、まだないもの

- 選ぶ（pick）のは人か Claude が絵を見て決める。設計の pick に {"look": N, "reveal": M, "mid": K} を書く
- 口パクの絵で口がほとんど変わらなかったものは、作り直す（2回まで）
- 切り抜き（pipeline/char_cut.py）は Pillow が要る。環境変数 CHAR_PY にその python を渡す（既定は python3）
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from common import ROOT
import char_image as ci

DESIGN = ROOT / "pipeline" / "ritsu_costumes.json"
APP_LIST = ROOT / "app" / "src" / "ritsu" / "costumes.json"
LINES = ROOT / "app" / "src" / "ritsu" / "lines.json"
PICKS = ROOT / "pipeline" / "ritsu_picks"  # 選んだ見本と一枚絵（別の端末でも続きから作れるように git に入れる）
CHAR_PY = os.environ.get("CHAR_PY", "python3")

SAME = ("Draw the SAME character as in the reference image: exactly the same young round face of a 15-year-old, same eye shape and brown eye color, "
        "EXACTLY the same soft pink-brown hair color, same art style and soft pastel colors, same framing (upper body, same size and position). ")
POSES = {1: "Gentle closed-mouth smile, looking at the viewer.", 2: "Bright happy smile, looking at the viewer.",
         3: "Shy smile, head slightly tilted.", 4: "Calm gentle smile, a little sleepy."}
SCENE_TAIL = (" Cozy pastel anime illustration, wide 4:3 composition. Absolutely no text or letters anywhere. "
              "Original design, not resembling any existing anime character, VTuber or real person.")


def design() -> dict:
    return json.loads(DESIGN.read_text(encoding="utf-8"))


def costume(cid: str) -> dict:
    return next(c for c in design()["costumes"] if c["id"] == cid)


def looks(ids: list[str]) -> None:
    ref = ci._img(ci.OUT / "g3" / "base-smile.png")
    jobs = []
    for c in design()["costumes"]:
        if ids and c["id"] not in ids:
            continue
        g = ci.OUT / "g8" / c["id"]
        g.mkdir(parents=True, exist_ok=True)
        jobs += [([ref, {"text": SAME + "New outfit. " + c["outfit"] + " " + c["look"] + " " + p + " " + ci.COMMON}], g / f"look-{k}.png")
                 for k, p in POSES.items()]
        scene = ("A full illustration (not a plain background): the SAME character as in the reference image (exactly the same young face of a "
                 "15-year-old, same eyes, EXACTLY the same soft pink-brown hair color, same art style). " + c["outfit"] + " " + c["scene"] + SCENE_TAIL)
        jobs += [([ref, {"text": scene}], g / f"reveal-{k}.png") for k in (1, 2)]
    ci.run_all(jobs)


def talk_strength(theme: str) -> dict[str, int]:
    """切り抜いた口パクの絵が、元の絵とどれだけ違うか（点の数）"""
    code = ("import sys,json;from PIL import Image,ImageChops;D=sys.argv[1];out={}\n"
            "import glob,os\n"
            "for t in glob.glob(D+'/*-talk.webp'):\n"
            "  b=t.replace('-talk.webp','.webp');a=Image.open(b).convert('RGB');c=Image.open(t).convert('RGB')\n"
            "  d=ImageChops.difference(a,c).convert('L').point(lambda v:255 if v>40 else 0);out[os.path.basename(t)]=sum(1 for v in d.getdata() if v)\n"
            "print(json.dumps(out))")
    r = subprocess.run([CHAR_PY, "-c", code, str(ROOT / "app" / "public" / "chars" / "ritsu" / theme)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def cut(theme: str) -> None:
    subprocess.run([CHAR_PY, str(ROOT / "pipeline" / "char_cut.py"), theme], check=True)


def build(cid: str) -> None:
    c = costume(cid)
    pick = c.get("pick")
    if not pick:
        raise SystemExit(f"{cid}：設計に pick（選んだ見本の番号）がない")
    g8, g = ci.OUT / "g8" / cid, ci.OUT / "themes" / cid
    g.mkdir(parents=True, exist_ok=True)
    for src, dst in ((f"look-{pick['look']}", "base-smile"), (f"reveal-{pick['reveal']}", "reveal")):
        if (g8 / f"{src}.png").exists():
            shutil.copy(g8 / f"{src}.png", g / f"{dst}.png")
        else:  # 別の端末：選んだ見本は git に入れてある（pipeline/ritsu_picks/。audio/samples_char/ は git に入らない）
            kind = "look" if src.startswith("look") else "reveal"
            subprocess.run([CHAR_PY, "-c", "import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2])",
                            str(PICKS / f"{cid}-{kind}.webp"), str(g / f"{dst}.png")], check=True)
    (g / "outfit.txt").write_text(c["outfit"] + "\n", encoding="utf-8")
    (g / "signature.txt").write_text(c["signature"] + "\n", encoding="utf-8")
    for step in (lambda: ci.theme_set(cid, g / "base-smile.png"), lambda: ci.sit_set(cid), lambda: ci.motion_set(cid), lambda: ci.extras_set(cid)):
        for attempt in range(3):  # 回数の制限で止まったら、続きから
            try:
                step()
                break
            except Exception as e:  # noqa: BLE001
                print(f"  やり直し（{e}）", flush=True)
    mid = g / f"mid-lie-{pick.get('mid', 2)}.png"
    if mid.exists():
        shutil.copy(mid, g / "mid-lie.png")
    cut(cid)
    # 口パクの絵で、口がほとんど変わらなかったもの（600点未満）は作り直す
    for _ in range(2):
        weak = [n for n, v in talk_strength(cid).items() if v < 600]
        if not weak:
            break
        print(f"  口パクを作り直す：{weak}", flush=True)
        for n in weak:  # base-smile-talk.webp → talk-base-smile.png
            kind, face = n.replace("-talk.webp", "").split("-", 1)
            (g / f"talk-{kind}-{face}.png").unlink(missing_ok=True)
        ci.extras_set(cid)
        cut(cid)
    add_lines(c)
    register(c)
    print(f"✅ {cid}", flush=True)


def add_lines(c: dict) -> None:
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    lines = [l for l in lines if l["scene"] not in (f"reveal_{c['id']}", f"wear_{c['id']}")]
    for scene, items in ((f"reveal_{c['id']}", c["reveal"]), (f"wear_{c['id']}", c["wear"])):
        for k, (text, face) in enumerate(items, 1):
            lines.append({"id": f"{scene}-{k:03d}", "scene": scene, "text": text, "face": face, "level": 1})
    LINES.write_text(json.dumps(lines, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(ROOT / "pipeline" / "ritsu_voice.py")], check=True)


def register(c: dict) -> None:
    """アプリの衣装の表（app/src/ritsu/costumes.json）に足す（設計の並び順）"""
    have = json.loads(APP_LIST.read_text(encoding="utf-8")) if APP_LIST.exists() else []
    have = [h for h in have if h["id"] != c["id"]] + [{k: c[k] for k in ("id", "name", "level", "bg", "desc")}]
    order = ["knit", "pajama"] + [x["id"] for x in design()["costumes"]]
    have.sort(key=lambda h: order.index(h["id"]) if h["id"] in order else 99)
    APP_LIST.write_text(json.dumps(have, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def backgrounds() -> None:
    bg = ci.OUT / "bg"
    bg.mkdir(parents=True, exist_ok=True)
    ci.run_all([([{"text": ci.BG + t + "."}], bg / f"{n}.png") for n, t in design()["backgrounds"].items()])
    subprocess.run([CHAR_PY, str(ROOT / "pipeline" / "char_cut.py"), "bg"], check=True)


def main() -> None:
    what = sys.argv[1]
    if what == "looks":
        looks(sys.argv[2:])
    elif what == "build":
        build(sys.argv[2])
    elif what == "bg":
        backgrounds()


if __name__ == "__main__":
    main()
