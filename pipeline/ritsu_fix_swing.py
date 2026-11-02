"""腰かけて足を振るコマの検査と作り直し（2026-11-02）：足が真横に伸びる・縁の線が残る絵を見つけて、そのコマだけ作り直す。

  CHAR_PY の python で：python pipeline/ritsu_fix_swing.py check [ID ...]   # あやしいコマの一覧
                        python pipeline/ritsu_fix_swing.py fix [ID ...]     # あやしいコマを作り直す（古い絵は themes/<ID>/rejected/ へ）
                        python pipeline/ritsu_fix_swing.py redo ID FACE K   # 名指しで作り直す
                        python pipeline/ritsu_fix_swing.py restore ID FACE K  # 作り直す前の絵（rejected/）に戻す。今の絵は rejected-soft/ へ
                        python pipeline/ritsu_fix_swing.py liven [ID ...]   # 動きの少ないコマを作り直す（ユーザーが戻すと選んだコマ＝rejected-soft/ にあるものは触らない）

- 元の絵（sit-<表情>）より、足のあたりが左右へはみ出した幅で判定する。絵の正しさまでは分からないので、人の目でも確かめる
- 公開済みの絵はそのコマだけ書き換える（ほかの絵を切り直さない）
"""
from __future__ import annotations

import functools
import glob
import os
import shutil
import sys
import tempfile
from pathlib import Path

import char_cut as cc
import char_image as ci
from common import ROOT
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageChops

SPECIAL = ROOT / "audio" / "samples_char" / "special"
FACES = ci.SWING_FACES
# 足のあたりで、元の絵より幅に対してこれ以上はみ出したらあやしい。0.05 だと動きのよい絵まではじいた（2026-11-02 ユーザーが選んだ絵は最大 0.108）
LIMIT = 0.12
MOTION_MIN = 0.08  # 足のあたりの形の変わり方がこれより少ないコマは「ただ座っている」（ユーザーが選んだ絵は 0.09〜0.28）


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


def motion(base: Image.Image, frame: Image.Image) -> float:
    """足のあたり（下 40%）の形が、元の絵からどれだけ変わったか（元の絵の面積に対する割合）"""
    w, h = base.size
    box = (0, round(h * 0.6), w, h)
    a, b = base.getchannel("A").crop(box).point(lambda v: 255 if v > 80 else 0), frame.getchannel("A").crop(box).point(lambda v: 255 if v > 80 else 0)
    return sum(1 for v in ImageChops.difference(a, b).getdata() if v) / max(1, sum(1 for v in a.getdata() if v))


@functools.lru_cache(maxsize=None)
def cached_ref(cid: str) -> tuple:
    return cc.sit_ref(cc.SRC / cid)


@functools.lru_cache(maxsize=None)
def cached_box(s: Path) -> tuple:
    return cc.swing_box(s)


def recut(cid: str, face: str, k: int, png: Path, dst: Path) -> None:
    src = cc.SRC / cid
    s = src / f"sit-{face}.png"
    ref = cached_ref(cid)
    frame = cc.patch_swing(s, png, cached_box(s))
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


def liven(cid: str, face: str, k: int, force: bool = False) -> None:
    """動きの少ないコマを作り直す。4回まで作って、はみ出しすぎない中で一番動いた絵を採る。今より動かなければ変えない（force なら必ず変える）"""
    g = ci.OUT / "themes" / cid
    s, png = g / f"sit-{face}.png", g / f"swing-{face}-{k}.png"
    d = dst_dir(cid)
    base = Image.open(d / f"sit-{face}.webp").convert("RGBA")
    now = motion(base, Image.open(d / f"sit-{face}-swing-{k}.webp").convert("RGBA"))
    text = ci.SWING + ci.SWINGS[k] + ". Everything else must stay identical." + ci.LIMBS + ci.outfit(g) + "No text. " + ci.COMMON
    best, best_m = None, -1.0
    with tempfile.TemporaryDirectory() as tmp:
        for attempt in range(4):
            cand = Path(tmp) / f"{attempt}.png"
            try:
                ci.generate([ci._img(s), {"text": text}], cand)
            except (Exception, SystemExit) as e:  # noqa: BLE001
                print(f"    {cid} {face}-{k}：{e}", flush=True)
                continue
            out = Path(tmp) / f"{attempt}.webp"
            recut(cid, face, k, cand, out)
            frame = Image.open(out).convert("RGBA")
            m, v = motion(base, frame), overflow(base, frame)
            if v <= LIMIT and m > best_m:
                best, best_m = attempt, m
            if best_m >= MOTION_MIN:
                break
        if best is None or (best_m <= now and not force):
            print(f"  {cid} {face}-{k} 変えない（今 {now:.3f}、作った中で最大 {best_m:.3f}）", flush=True)
            return
        (g / "rejected-still").mkdir(exist_ok=True)
        if png.exists():
            shutil.copy(png, g / "rejected-still" / png.name)
        shutil.copy(Path(tmp) / f"{best}.png", png)
        shutil.copy(Path(tmp) / f"{best}.webp", d / f"sit-{face}-swing-{k}.webp")
    print(f"  {cid} {face}-{k} 動き {now:.3f} → {best_m:.3f}", flush=True)


def liven_all(cids: list[str]) -> None:
    jobs = []
    for cid in cids:
        d, g = dst_dir(cid), ci.OUT / "themes" / cid
        for f in FACES:
            base = Image.open(d / f"sit-{f}.webp").convert("RGBA")
            for k in (1, 2):
                p = d / f"sit-{f}-swing-{k}.webp"
                if p.exists() and not (g / "rejected-soft" / f"swing-{f}-{k}.png").exists() and motion(base, Image.open(p).convert("RGBA")) < MOTION_MIN:
                    jobs.append((cid, f, k))
    print(f"{len(jobs)} コマを作り直す", flush=True)
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda j: liven(*j), jobs))


def restore(cid: str, face: str, k: int) -> None:
    """2026-11-02：作り直しで動きが減ったコマのうち、前の絵のほうがよいとユーザーが選んだものを戻す"""
    g = ci.OUT / "themes" / cid
    png, old = g / f"swing-{face}-{k}.png", g / "rejected" / f"swing-{face}-{k}.png"
    (g / "rejected-soft").mkdir(exist_ok=True)
    shutil.copy(png, g / "rejected-soft" / png.name)
    shutil.copy(old, png)
    recut(cid, face, k, png, dst_dir(cid) / f"sit-{face}-swing-{k}.webp")
    print(f"  {cid} {face}-{k} を戻した", flush=True)


def main() -> None:
    what = sys.argv[1]
    if what == "restore":
        restore(sys.argv[2], sys.argv[3], int(sys.argv[4]))
        return
    if what == "liven":
        if sys.argv[2:5] and sys.argv[2] == "--force":  # 名指しで必ず作り直す（足が3本など）
            liven(sys.argv[3], sys.argv[4], int(sys.argv[5]), force=True)
            return
        liven_all(sys.argv[2:] or ids())
        return
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
