"""長い持ち物（杖など）と体に囲まれた背景は、切り抜きで残る（端からたどれないため）。立ち絵の、囲まれた白い部分を透明にする（2026-11-03 雪花）。

  CHAR_PY の python で：python pipeline/ritsu_fix_holes.py yukihana
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SPECIAL = Path(__file__).resolve().parent.parent / "audio" / "samples_char" / "special"
MIN_AREA = 0.004  # 絵の面積に対して、これより小さい白は服の模様として残す
BELOW = 0.38  # 毛皮やうさぎの白は上のほうにある。これより下の白だけ見る


def holes(a: np.ndarray) -> np.ndarray:
    """ほぼ白で色のない、大きなひとかたまりを探す"""
    h, w, _ = a.shape
    near = (a[..., :3].min(2) > 232) & (a[..., :3].max(2) - a[..., :3].min(2) < 14) & (a[..., 3] > 128)
    seen = np.zeros_like(near)
    out = np.zeros_like(near)
    for y, x in zip(*np.where(near)):
        if seen[y, x]:
            continue
        stack, part = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            part.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        ys = [p[0] for p in part]
        if len(part) >= MIN_AREA * w * h and sum(ys) / len(ys) > BELOW * h:
            for cy, cx in part:
                out[cy, cx] = True
    return out


def fix(path: Path) -> int:
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).copy()
    m = holes(a)
    if not m.any():
        return 0
    soft = np.asarray(Image.fromarray((m * 255).astype("uint8")).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))).astype(float) / 255
    a[..., 3] = (a[..., 3] * (1 - soft)).astype("uint8")
    Image.fromarray(a).save(path, "WEBP", quality=90, method=5)
    return int(m.sum())


if __name__ == "__main__":
    for p in sorted((SPECIAL / sys.argv[1]).glob("base-*.webp")):
        print(p.name, fix(p), flush=True)
