"""腰かけて足を振るコマの検査と作り直し（2026-11-02）：足が真横に伸びる・縁の線が残る絵を見つけて、そのコマだけ作り直す。

  CHAR_PY の python で：python pipeline/ritsu_fix_swing.py check [ID ...]   # あやしいコマの一覧
                        python pipeline/ritsu_fix_swing.py fix [ID ...]     # あやしいコマを作り直す（古い絵は themes/<ID>/rejected/ へ）
                        python pipeline/ritsu_fix_swing.py redo ID FACE K   # 名指しで作り直す

- 元の絵（sit-<表情>）より、足のあたりが左右へはみ出した幅で判定する。絵の正しさまでは分からないので、人の目でも確かめる
- 公開済みの絵はそのコマだけ書き換える（ほかの絵を切り直さない）
"""
from __future__ import annotations

import glob
import os
import shutil
import sys
import tempfile
from pathlib import Path

import char_cut as cc
import char_image as ci
from common import ROOT
from PIL import Image

SPECIAL = ROOT / "audio" / "samples_char" / "special"
FACES = ci.SWING_FACES
LIMIT = 0.05  # 足のあたりで、元の絵より幅に対してこれ以上はみ出したらあやしい


def dst_dir(cid: str) -> Path:
    return SPECIAL / cid if (SPECIAL / cid).is_dir() else ROOT / "app" / "public" / "chars" / "ritsu" / cid


def ids() -> list[str]:
    pub = [Path(p).name for p in sorted(glob.glob(str(ROOT / "app/public/chars/ritsu/*"))) if os.path.exists(p + "/sit-smile-swing-1.webp")]
    return pub + [p.name for p in sorted(SPECIAL.iterdir()) if p.is_dir() and (p / "sit-smile-swing-1.webp").exists()]


def spread(path: Path) -> float:
    """絵の足のあたり（下 45%）の横の広がりの中で、はみ出しの大きさを測るための範囲"""
    im = Image.open(path).convert("RGBA")
    return im


def overflow(base: Image.Image, frame: Image.Image) -> float:
    """足のあたりで、元の絵の範囲より左右にはみ出した幅（絵の幅に対する割合）"""
    w, h = base.size
    y0 = round(h * 0.55)
    a, b = base.getchannel("A").crop((0, y0, w, h)).point(lambda v: 255 if v > 80 else 0), frame.getchannel("A").crop((0, y0, w, h)).point(lambda v: 255 if v > 80 else 0)
    ba, bb = a.getbbox(), b.getbbox()
    if not ba or not bb:
        return 1.0
    return max(ba[0] - bb[0], bb[2] - ba[2], 0) / w


def suspects(cid: str) -> list[tuple[str, int, float]]:
    d = dst_dir(cid)
    out = []
    for f in FACES:
        base = Image.open(d / f"sit-{f}.webp").convert("RGBA")
        for k in (1, 2):
            p = d / f"sit-{f}-swing-{k}.webp"
            if p.exists():
                v = overflow(base, Image.open(p).convert("RGBA"))
                if v > LIMIT:
                    out.append((f, k, v))
    return out


def recut(cid: str, face: str, k: int, png: Path, dst: Path) -> None:
    src = cc.SRC / cid
    s = src / f"sit-{face}.png"
    ref = cc.sit_ref(src)
    frame = cc.patch(s, png, cc.swing_box(s))
    with tempfile.TemporaryDirectory() as tmp:
        cc.sit_group([Image.open(s), frame], [Path(tmp) / "b.webp", dst], ref=(ref[2].get(face, ref[0]), ref[1]))


def redo(cid: str, face: str, k: int) -> float:
    g = ci.OUT / "themes" / cid
    s = g / f"sit-{face}.png"
    png = g / f"swing-{face}-{k}.png"
    (g / "rejected").mkdir(exist_ok=True)
    if png.exists() and not (g / "rejected" / png.name).exists():
        shutil.copy(png, g / "rejected" / png.name)
    d = dst_dir(cid)
    base = Image.open(d / f"sit-{face}.webp").convert("RGBA")
    best, best_v = None, 9.0
    text = ci.SWING + ci.SWINGS[k] + ". Everything else must stay identical." + ci.LIMBS + ci.outfit(g) + "No text. " + ci.COMMON
    with tempfile.TemporaryDirectory() as tmp:
        for attempt in range(3):
            cand = Path(tmp) / f"{attempt}.png"
            try:
                ci.generate([ci._img(s), {"text": text}], cand)
            except (Exception, SystemExit) as e:  # noqa: BLE001
                print(f"    {cid} {face}-{k}：{e}", flush=True)
                continue
            out = Path(tmp) / f"{attempt}.webp"
            recut(cid, face, k, cand, out)
            v = overflow(base, Image.open(out).convert("RGBA"))
            if v < best_v:
                best, best_v = attempt, v
            if v <= LIMIT:
                break
        if best is None:
            return 9.0
        shutil.copy(Path(tmp) / f"{best}.png", png)
        shutil.copy(Path(tmp) / f"{best}.webp", d / f"sit-{face}-swing-{k}.webp")
    print(f"  {cid} {face}-{k} はみ出し {best_v:.3f}", flush=True)
    return best_v


def main() -> None:
    what = sys.argv[1]
    if what == "redo":
        redo(sys.argv[2], sys.argv[3], int(sys.argv[4]))
        return
    for cid in sys.argv[2:] or ids():
        found = suspects(cid)
        print(cid, [(f, k, round(v, 3)) for f, k, v in found], flush=True)
        if what == "fix":
            for f, k, _ in found:
                redo(cid, f, k)


if __name__ == "__main__":
    main()
