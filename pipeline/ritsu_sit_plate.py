"""腰かける絵の足まわりを、単色の背景で描き直した絵に差し替える（2026-11-02）。

灰色の縁の上に描いた絵を色で切り抜くと、淡い靴に穴があき、影や線が残り、縁より上に上げた足が消えた（ユーザー）。
単色の背景なら、きれいに抜ける。ただ描き直すと大きさと色が少しずれるので、上半身は今の絵のまま、縁より下だけを位置と色を合わせて貼る。

  CHAR_PY の python で：python pipeline/ritsu_sit_plate.py make ID [ID ...]   # 足を振るコマと元の絵を単色の背景で描き直す（themes/<ID>/plate/）
                        python pipeline/ritsu_sit_plate.py apply ID [ID ...]  # 足まわりを差し替える
"""
from __future__ import annotations

import functools
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import char_cut as cc
import char_image as ci
from common import ROOT

LINE = cc.SIT_HEIGHT + cc.SIT_TOP_MARGIN  # 幅 240 の絵の中での縁の線の高さ
MAGENTA = {"jersey", "pajama", "library", "yukata", "knit"}  # 緑系の服や柄がある衣装は、緑の背景だと服まで抜ける
TEXT = ("Redraw the reference image EXACTLY: the same character, same pose, same position and size, the same arms, the same legs and feet in exactly the same position, "
        "the same outfit and colors, same art style and line art. Change ONLY the background: remove the ledge, the dark lines, the grey band and every drop shadow, "
        "and fill everything behind the character with a solid flat pure {name} ({hex}), with no shadow, no gradient, no ground and no motion lines. "
        "Both legs and both feet stay fully drawn, exactly two legs and two feet, even where they crossed the ledge. No {name} on the character. "
        "No text, no watermark. Original anime-style character, 15 years old, not resembling any existing character.")


def excess(a: np.ndarray, magenta: bool) -> np.ndarray:
    return np.minimum(a[..., 0], a[..., 2]) - a[..., 1] if magenta else a[..., 1] - np.maximum(a[..., 0], a[..., 2])


def key(path: Path, magenta: bool) -> Image.Image:
    """背景の色の強さで抜く。色を抑えるのは縁だけ（全体を抑えると髪や肌の色が変わる）"""
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(excess(edge, magenta))
    al = np.clip((bg * 0.72 - excess(a, magenta)) / (bg * 0.42), 0, 1)
    near = np.asarray(Image.fromarray(((al < 0.98) * 255).astype("uint8")).filter(ImageFilter.MaxFilter(5))) > 128
    d = a.copy()
    if magenta:
        lim = a[..., 1] + 24
        d[..., 0] = np.where(near, np.minimum(a[..., 0], lim), a[..., 0])
        d[..., 2] = np.where(near, np.minimum(a[..., 2], lim), a[..., 2])
    else:
        d[..., 1] = np.where(near, np.minimum(a[..., 1], np.maximum(a[..., 0], a[..., 2]) + 4), a[..., 1])
    return Image.fromarray(np.dstack([d, al * 255]).astype("uint8"))


@functools.lru_cache(maxsize=None)
def _ref(cid: str) -> tuple:
    return cc.sit_ref(cc.SRC / cid)


@functools.lru_cache(maxsize=None)
def _top(cid: str, face: str) -> int:
    return cc.ledge_cut(Image.open(cc.SRC / cid / f"sit-{face}.png"))[1]


def fit(plate: Image.Image, base: Image.Image, cid: str, face: str) -> tuple[Image.Image, float]:
    """単色の背景の絵を、今の絵の上半身の形に合わせて置く。今の絵を切り出したときの倍率と中心を基準に、大きさと位置を探す。返り値は base と同じ大きさ"""
    scale0, cx, per = _ref(cid)
    scale0 = per.get(face, scale0)
    top = _top(cid, face)
    w, h = base.size
    small = 3
    uu = (np.asarray(base.getchannel("A")) > 128)[:LINE - 6:small, ::small]
    a0 = plate.getchannel("A")
    best = (-1.0, scale0, 0, 0)

    def search(scales, dys, dxs, c=(0, 0)):
        nonlocal best
        for scale in scales:
            pw, ph = round(plate.width * scale), round(plate.height * scale)
            m = np.asarray(a0.resize((max(1, pw // small), max(1, ph // small)), Image.BILINEAR)) > 128
            x_c, y_c = round(w / 2 - cx * scale), round(LINE - top * scale)
            for dy in dys:
                for dx in dxs:
                    sx, sy = (x_c + c[0] + dx) // small, (y_c + c[1] + dy) // small
                    ax0, ay0, ax1, ay1 = max(0, sx), max(0, sy), min(uu.shape[1], sx + m.shape[1]), min(uu.shape[0], sy + m.shape[0])
                    if ax1 <= ax0 or ay1 <= ay0:
                        continue
                    part = m[ay0 - sy:ay1 - sy, ax0 - sx:ax1 - sx]
                    inter = (part & uu[ay0:ay1, ax0:ax1]).sum()
                    v = inter / max(1, uu.sum() + part.sum() - inter)
                    if v > best[0]:
                        best = (v, scale, x_c + c[0] + dx, y_c + c[1] + dy)

    search(scale0 * np.arange(0.62, 1.42, 0.04), range(-72, 73, 9), range(-72, 73, 9))  # 粗く探してから、そのまわりを細かく
    s1 = best[1]
    x_c, y_c = round(w / 2 - cx * s1), round(LINE - top * s1)
    search(s1 * np.arange(0.97, 1.031, 0.01), range(-9, 10, 3), range(-9, 10, 3), (best[2] - x_c, best[3] - y_c))
    v, scale, x0, y0 = best
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(plate.resize((round(plate.width * scale), round(plate.height * scale)), Image.LANCZOS), (x0, y0))
    return out, float(v)


def compose(base: Image.Image, plate: Image.Image, top: Image.Image | None = None, raised: bool = True) -> Image.Image:
    """縁より上は top（省くと base）のまま、縁より下は plate。縁より上でも、上げた足など base にないものは足す"""
    top = top or base
    b, u, p = np.asarray(base).astype(float), np.asarray(top).astype(float), np.asarray(plate).astype(float)
    h = b.shape[0]
    # 色合わせ：縁のすぐ上で両方に写っているところの明るさをそろえる
    band = (b[..., 3] > 200) & (p[..., 3] > 200)
    band[:LINE - 60] = False
    band[LINE:] = False
    gain = np.ones(3)
    if band.sum() > 200:
        gain = np.clip(b[band][:, :3].mean(0) / np.maximum(1, p[band][:, :3].mean(0)), 0.8, 1.25)
    pc = np.dstack([np.clip(p[..., :3] * gain, 0, 255), p[..., 3]])
    out = u.copy()
    # 縁より下を plate に（縁の少し上から徐々に）
    ramp = np.clip((np.arange(h) - (LINE - 10)) / 10, 0, 1)[:, None, None]
    out = out * (1 - ramp) + pc * ramp
    # 縁より上：plate にあって base にないところ、形が大きく違うところを足す（上げた足）
    if not raised:
        return Image.fromarray(out.astype("uint8"))
    y0 = LINE - round(h * 0.25)
    diff = np.abs(pc[..., :3] - b[..., :3]).sum(2)
    add = (pc[..., 3] > 128) & ((b[..., 3] < 60) | (diff > 90))
    add[:y0] = False
    add[LINE - 2:] = False
    m = Image.fromarray((add * 255).astype("uint8")).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1))
    a = (np.asarray(m).astype(float) / 255)[..., None]
    return Image.fromarray((out * (1 - a) + pc * a).astype("uint8"))


D = ROOT / "app" / "public" / "chars" / "ritsu"
GOOD_FIT = 0.86  # 上半身の形がこれ以上重なれば、位置が合っている
TRIES = 3


def plate_dir(cid: str) -> Path:
    p = cc.SRC / cid / "plate"
    p.mkdir(exist_ok=True)
    return p


def bg_words(cid: str) -> dict:
    return {"name": "bright magenta", "hex": "#FF00FF"} if cid in MAGENTA else {"name": "green", "hex": "#00C040"}


def make_one(cid: str, face: str, name: str, parts: list) -> str:
    """単色の背景の絵を作る。位置が合わなければ作り直す。一番合った絵を残す"""
    out = plate_dir(cid) / f"{name}.png"
    if out.exists():
        return f"{cid} {name} ある"
    base = Image.open(D / cid / f"sit-{face}.webp").convert("RGBA")
    best, best_v, tmp = None, -1.0, out.with_suffix(".try.png")
    for _ in range(TRIES):
        try:
            ci.generate(parts, tmp)
        except (Exception, SystemExit) as e:  # noqa: BLE001
            print(f"    {cid} {name}：{e}", flush=True)
            continue
        v = fit(key(tmp, cid in MAGENTA), base, cid, face)[1]
        if v > best_v:
            best, best_v = tmp.read_bytes(), v
        if v >= GOOD_FIT:
            break
    tmp.unlink(missing_ok=True)
    if best is None:
        return f"{cid} {name} 作れなかった"
    out.write_bytes(best)
    return f"{cid} {name} 重なり {best_v:.2f}" + ("（低い）" if best_v < GOOD_FIT else "")


def make(cid: str) -> None:
    g = cc.SRC / cid
    text = TEXT.format(**bg_words(cid))
    jobs = []
    for p in sorted(g.glob("sit-*.png")):
        face = p.stem[4:]
        jobs.append((cid, face, p.stem, [ci._img(p), {"text": text}]))
    for p in sorted(g.glob("swing-*.png")):
        _, face, k = p.stem.split("-")
        jobs.append((cid, face, p.stem, [ci._img(p), {"text": text}]))
    with ThreadPoolExecutor(3) as ex:
        for msg in ex.map(lambda j: make_one(*j), jobs):
            print(" ", msg, flush=True)


def repose(cid: str, face: str, k: int) -> None:
    """元の絵のポーズがおかしいコマ：ポーズから作り直す（単色の背景で）"""
    g = cc.SRC / cid
    out = plate_dir(cid) / f"swing-{face}-{k}.png"
    out.unlink(missing_ok=True)
    w = bg_words(cid)
    text = ("Redraw the reference image EXACTLY (same pose, same size and position, same face, hair, outfit and colors), changing ONLY her lower legs and feet: " + ci.SWINGS[k]
            + " Remove the ledge, the dark lines, the grey band and every drop shadow, and fill everything behind the character with a solid flat pure " + w["name"] + " (" + w["hex"] + "), "
            + "with no shadow, no gradient and no motion lines. No " + w["name"] + " on the character. " + ci.LIMBS + ci.outfit(g) + " No text, no watermark. Original anime-style character, 15 years old, not resembling any existing character.")
    print(" ", make_one(cid, face, f"swing-{face}-{k}", [ci._img(g / f"sit-{face}.png"), {"text": text}]), flush=True)


def apply(cid: str) -> None:
    d, pd = D / cid, plate_dir(cid)
    magenta = cid in MAGENTA
    done, low = 0, []
    plates: dict[str, Image.Image] = {}
    base = {}

    def get(face: str, name: str) -> tuple[Image.Image, Image.Image]:
        b = base.setdefault(face, Image.open(d / f"sit-{face}.webp").convert("RGBA").copy())
        if name not in plates:
            plates[name], v = fit(key(pd / f"{name}.png", magenta), b, cid, face)
            if v < GOOD_FIT:
                low.append(f"{name} {v:.2f}")
        return b, plates[name]

    for p in sorted(d.glob("sit-*.webp")):
        parts = p.stem.split("-")
        face = parts[1]
        if not (pd / f"sit-{face}.png").exists():
            print(f"  {cid} {p.name}：単色の絵がない", flush=True)
            continue
        if "swing" in parts:
            b, pl = get(face, f"swing-{face}-{parts[-1]}")
            o = compose(b, pl)
        else:
            b, pl = get(face, f"sit-{face}")
            o = compose(b, pl, top=Image.open(p).convert("RGBA"), raised=False)
        cc.webp(o, p)
        done += 1
    print(f"{cid} {done} 枚を差し替えた" + (f"　位置が合っていない：{low}" if low else ""), flush=True)


def main() -> None:
    what = sys.argv[1]
    if what == "repose":
        repose(sys.argv[2], sys.argv[3], int(sys.argv[4]))
        return
    for cid in sys.argv[2:]:
        (make if what == "make" else apply)(cid)


if __name__ == "__main__":
    main()
