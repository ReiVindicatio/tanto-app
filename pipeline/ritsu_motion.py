"""律の特別な衣装の固有モーション（2026-11-03）：座り絵を最初と最後のコマにして、動画モデル（Veo）で数秒動かす。

  CHAR_PY の python で：python pipeline/ritsu_motion.py ID   # ritsu_motions.json の動きを作り、special/<ID>/motion-<名前>.mp4 へ
  そのあと python3 pipeline/ritsu_special_finish.py upload <ID>

- 緑の背景の動画から色を抜く。透明は mp4 に持てないので、左に色・右に透明度を並べて1本にする（再生は app/src/ritsu/MotionClip.tsx）
- 最初と最後は同じ絵なので、ふだんの座り絵とつながる。動き終わったあとの静止は切り落とす
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

import char_cut as cc
from common import ROOT
from ritsu_sit_plate import key
from ritsu_wind import PAD, SETS, SPECIAL, crop_box

VIDEO = ROOT / "audio" / "samples_char" / "video" / "motions"
MOTIONS = ROOT / "pipeline" / "ritsu_motions.json"
W, H = 720, 1280  # Veo の 9:16
FIG = 560  # 律の幅
BOTTOM = 160
OUT_W, OUT_H, FPS = 360, 640, 20
STILL = 6.0  # 最後のコマとの差がこれより小さければ、動き終わったとみなす
STYLE = ("Keep the exact anime illustration style, flat clean line art and colors of the input image; her face, hair, outfit and proportions stay exactly the same throughout. "
         "Fixed camera, no zoom, no camera movement. The background stays a perfectly flat pure bright green with nothing on it. She stays in the same place at the same size. "
         "Exactly two arms. No text, no letters, no extra people. Modest clothing, she is about 15 years old. ")


def first_frame(cid: str, out: Path) -> list[float]:
    """動画の最初と最後のコマを作る。返り値は、ふだんの絵の幅に対する動画の位置 [左, 上, 幅]"""
    w = SETS[cid]["wind"]
    full = key(cc.SRC / cid / "proto" / w["file"], False)
    full.putalpha(full.getchannel("A").point(lambda v: 0 if v < 64 else v))
    box = crop_box(full, PAD)
    body = full.crop(full.getchannel("A").getbbox())
    k = FIG / body.width
    fig = body.resize((FIG, round(body.height * k)), Image.LANCZOS)
    bg = Image.new("RGB", (W, H), (0, 255, 0))
    x, y = (W - FIG) // 2, H - fig.height - BOTTOM
    bg.paste(fig, (x, y), fig)
    bg.save(out)
    fw = (box[2] - box[0]) * k
    return [round(-(x - PAD * k) / fw, 4), round(-(y - PAD * k) / fw, 4), round(W / fw, 4)]


def frames_of(src: Path) -> list[np.ndarray]:
    """色を抜いて、透明度をかけた色（premultiplied）にする。縁の緑は全体で抑える（衣装に緑はない）"""
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"fps={FPS}", f"{t}/%03d.png"], check=True)
        out = []
        for f in sorted(Path(t).glob("*.png")):
            im = key(f, False).resize((OUT_W, OUT_H), Image.LANCZOS)
            a = np.asarray(im).astype(float)
            a[..., 3] = np.where(a[..., 3] < 64, 0, a[..., 3])
            a[..., 1] = np.minimum(a[..., 1], np.maximum(a[..., 0], a[..., 2]) + 6)
            out.append(a)
    return out


def encode(frames: list[np.ndarray], out: Path) -> None:
    last = frames[-1]
    end = len(frames) - 1
    while end > 1 and np.abs(frames[end] - last).mean() < STILL:
        end -= 1
    keep = frames[: min(len(frames), end + FPS // 5)] + [last]
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT_W * 2}x{OUT_H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    for a in keep:
        al = a[..., 3:] / 255
        pair = np.concatenate([a[..., :3] * al, np.repeat(a[..., 3:], 3, axis=2)], axis=1)
        p.stdin.write(pair.astype("uint8").tobytes())
    p.stdin.close()
    p.wait()
    print(f"  {out.name} {out.stat().st_size // 1024}KB {len(keep) / FPS:.1f}秒", flush=True)


def make(cid: str) -> None:
    import ritsu_video as rv

    g = VIDEO / cid
    g.mkdir(parents=True, exist_ok=True)
    first = g / "first.png"
    print("位置", first_frame(cid, first), flush=True)
    for m in json.loads(MOTIONS.read_text(encoding="utf-8"))[cid]:
        src = g / f"{m['name']}.mp4"
        if not src.exists():
            rv.generate(STYLE + m["text"], first, src, 6, "9:16", last=first)
        encode(frames_of(src), SPECIAL / cid / f"motion-{m['name']}.mp4")


if __name__ == "__main__":
    make(sys.argv[1])
