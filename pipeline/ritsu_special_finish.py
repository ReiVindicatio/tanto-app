"""律の特別な衣装の仕上げ（T069）：動画を配信の形にして、一式を R2 に上げる。手順は docs/ritsu-special-costumes.md

  CHAR_PY の python で：python pipeline/ritsu_special_finish.py pack <衣装ID>   # 動画・縦長の絵・小さな決めポーズを audio/samples_char/special/<ID>/ へ
  python3 pipeline/ritsu_special_finish.py upload <衣装ID>                       # 一式を R2（special/<ID>/）へ。絵と声と動画は git にも app/public/ にも置かない

- 全画面の動画：音を外し（声はセリフとして別に流す）、途中から再生できる形にする
- 小さな決めポーズ：単色の背景の動画から色を抜き、透明つきのアニメーション webp にする（1回だけ流れる）
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEO = ROOT / "audio" / "samples_char" / "video"
SPECIAL = ROOT / "audio" / "samples_char" / "special"
BUCKET = "tantan-audio"
TYPES = {".webp": "image/webp", ".mp4": "video/mp4", ".mp3": "audio/mpeg"}


def key_out(frame, green: tuple[int, int, int]):
    """背景の色で緑が勝っているところを透明にし、縁に残る緑を抑える。
    色の近さだけで抜くと、金の天秤のような近い色まで消えた（2026-11-01）ので、緑が赤と青より強いことを条件にする"""
    im = frame.convert("RGBA")
    px = im.load()
    full = green[1] - max(green[0], green[2])  # 背景で緑がどれだけ勝っているか
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            over = g - max(r, b)
            near = abs(r - green[0]) + abs(g - green[1]) + abs(b - green[2]) < 150
            a = 255
            if near and over > 0:
                a = round(255 * (1 - min(1, over / (full * 0.6))))
            if over > 0 and a:
                g = max(r, b)
            px[x, y] = (r, g, b, a)
    return im


def small_move(src: Path, out: Path) -> None:
    from PIL import Image

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "fps=12,crop=iw:iw,scale=360:-1", f"{tmp}/%03d.png"], check=True)
        files = sorted(Path(tmp).glob("*.png"))
        first = Image.open(files[0]).convert("RGB")
        green = first.getpixel((4, 4))  # 背景の色は隅で測る
        frames = [key_out(Image.open(f), green) for f in files]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=83, loop=1, quality=72, method=4, allow_mixed=True)
    print(f"  small.webp {out.stat().st_size // 1024}KB・{len(frames)}コマ", flush=True)


def pack(cid: str) -> None:
    from PIL import Image

    dst = SPECIAL / cid
    dst.mkdir(parents=True, exist_ok=True)
    for move in ("entrance", "finish"):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(VIDEO / f"{cid}-{move}.mp4"), "-an", "-c:v", "libx264", "-crf", "26", "-preset", "slow",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst / f"{move}.mp4")], check=True)
        print(f"  {move}.mp4 {(dst / f'{move}.mp4').stat().st_size // 1024}KB", flush=True)
    tall = Image.open(VIDEO / "src" / f"{cid}-tall.png").convert("RGB")
    tall.thumbnail((720, 1280))
    tall.save(dst / "tall.webp", quality=78)
    small_move(VIDEO / f"{cid}-small.mp4", dst / "small.webp")
    print(f"✅ {dst.relative_to(ROOT)}", flush=True)


def put(args: tuple[Path, str]) -> str:
    f, key = args
    subprocess.run(["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}", "--file", str(f), "--content-type", TYPES[f.suffix], "--remote"],
                   cwd=ROOT / "app", check=True, capture_output=True)
    return key


def upload(cid: str) -> None:
    src = SPECIAL / cid
    files = [f for f in sorted(src.rglob("*")) if f.suffix in TYPES]
    print(f"{len(files)} 個を上げる", flush=True)
    jobs = [(f, f"special/{cid}/{f.relative_to(src).as_posix()}") for f in files]
    with ThreadPoolExecutor(6) as ex:
        for n, _ in enumerate(ex.map(put, jobs), 1):
            if n % 20 == 0:
                print(f"  {n}/{len(jobs)}", flush=True)
    print("✅ 上げた", flush=True)


if __name__ == "__main__":
    {"pack": pack, "upload": upload}[sys.argv[1]](sys.argv[2])
