"""律の特別な衣装の「普段の違い」の素材（docs/ritsu-special-ideas.md の試作）：セリフと声・絵・ループ動画を作り、audio/samples_char/special/<ID>/ へ。

  CHAR_PY の python で：python pipeline/ritsu_special_more.py lines|images|videos [ID]

1つ失敗しても残りを作る。あるものは作り直さない。git にも app/public/ にも入れない（R2 へ。ritsu_special_finish.py upload）
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import char_cut as cc
import char_image as ci
import ritsu_special_finish as fin
import ritsu_video as rv
from common import ROOT
from PIL import Image

LINES = ROOT / "app" / "src" / "ritsu" / "lines.json"
MORE = ROOT / "pipeline" / "ritsu_special_more_lines.json"
TAIL = " Absolutely no text or letters anywhere. Original design, not resembling any existing anime character, VTuber or real person. Modest clothing, she is about 15 years old."
GREEN = "on a completely flat pure bright green background (#00FF00) with no shadow, no gradient and no other objects. Green must not appear on the subject."


def design(cid: str) -> dict:
    d = json.loads((ROOT / "pipeline" / "ritsu_special.json").read_text(encoding="utf-8"))
    return {**next(c for c in d["costumes"] if c["id"] == cid), "backgrounds": d["backgrounds"]}


def lines(cid: str) -> None:
    c = design(cid)
    scenes = json.loads(MORE.read_text(encoding="utf-8"))
    all_lines = [l for l in json.loads(LINES.read_text(encoding="utf-8")) if l["scene"] not in scenes]
    for scene, items in scenes.items():
        for k, (text, face) in enumerate(items, 1):
            line = {"id": f"{scene}-{k:03d}", "scene": scene, "text": text, "face": face, "level": 1, "special": cid}
            if "{" in text:
                line["voice"] = False
            if not scene.startswith(("remember_", "ch")):  # ふつうの服の律と、物語の語りは素の声
                line["style"] = c["voice_style"]
            all_lines.append(line)
    LINES.write_text(json.dumps(all_lines, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    env = {**os.environ, "RITSU_SPECIAL": cid, "RITSU_VOICE_OUT": str(fin.SPECIAL / cid / "voices")}
    subprocess.run([sys.executable, str(ROOT / "pipeline" / "ritsu_voice.py")], check=True, env=env)


def save(im: Image.Image, out: Path, width: int, quality: int = 80) -> None:
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(out, quality=quality, method=4)
    print(f"  {out.name} {out.stat().st_size // 1024}KB", flush=True)


def images(cid: str) -> None:
    c = design(cid)
    g = ci.OUT / "themes" / cid / "more"
    g.mkdir(parents=True, exist_ok=True)
    dst = fin.SPECIAL / cid
    base = ci._img(ci.OUT / "themes" / cid / "base-smile.png")
    same = " The SAME character as in the reference image: exactly the same young face of a 15-year-old, same eyes, EXACTLY the same soft pink-brown hair color, same art style." + TAIL
    keep = "Same upper-body framing, same size and same pose as the reference image, plain white background. "
    jobs = {
        "star-pal": ([{"text": "A tiny cute star spirit mascot: a plump pale gold five-pointed star with a tiny sleepy smiling face and a soft glow, pastel anime style, " + GREEN + TAIL}], "key", 160, None),
        "bg-nomoon": ([{"text": ci.BG + c["backgrounds"][c["bg"]].replace(", a crescent moon", "") + ". There is NO moon in the sky."}], "plain", 960, None),
        "base-smile-evo2": ([base, {"text": "Same character with an upgraded outfit: the same cape now has brighter glowing constellations and a soft gold trim, and a slightly larger golden crescent hair ornament. " + keep + same}], "cut", 480, None),
        "base-smile-evo3": ([base, {"text": "Same character with her final outfit: the same cape now shines with a galaxy of glowing gold stars, a small halo of floating stars behind her head, the star scale glows. Still modest and elegant. " + keep + same}], "cut", 480, None),
        "base-smile-dawn": ([base, {"text": "Same character and same outfit design, but the cape is recolored to the colors of dawn: soft rose, lavender and pale gold gradient, with the same constellation pattern. " + keep + same}], "cut", 480, None),
        "ch1": ([base, {"text": "A full illustration. A young apprentice stands in a stone tower under the stars, looking up at a huge fantasy star scale taller than she is, holding one tiny glowing star in her palm. Wide 4:3." + same}], "plain", 960, None),
        "ch2": ([base, {"text": "A full illustration. At dawn, on a long spiral stone staircase, she has found a fallen glowing star and hugs it gently, tired but relieved smile. Wide 4:3." + same}], "plain", 960, None),
        "ch3": ([base, {"text": "A full illustration. At the top of the tower under a sky completely full of gold stars, she turns back and smiles warmly at the viewer, holding the scale, her cape flowing. Wide 4:3." + same}], "plain", 960, None),
        "stage-wide": ([base, {"text": "A wide illustration: she stands on top of a stone tower under a starry night sky with soft clouds below, her whole upper body visible on the right side of the frame, holding the star scale, gentle smile, cape and long hair flowing. " + c["outfit"] + same}], "src", 0, "16:9"),
    }
    for name, (parts, kind, width, aspect) in jobs.items():
        png = g / f"{name}.png"
        try:
            if not png.exists():
                print(f"  作る：{name}", flush=True)
                ci.generate(parts, png, aspect)
            if kind == "src":
                continue
            im = Image.open(png).convert("RGB")
            if kind == "key":
                o = fin.key_out(im, im.getpixel((4, 4)))
                save(o.crop(o.getbbox()), dst / f"{name}.webp", width)
            elif kind == "cut":
                o = cc.cutout(im, cc.edges(*im.size))
                save(o.crop(cc.bbox(o)), dst / f"{name}.webp", width)
            else:
                save(im, dst / f"{name}.webp", width)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {name}：{e}", flush=True)
    print("✅ 絵", flush=True)


def sit_source(cid: str, out: Path) -> None:
    """腰かける絵を緑の上に、9:16 の中央へ（動画のあとで同じ範囲を切り出す）"""
    sit = Image.open(fin.SPECIAL / cid / "sit-smile.webp").convert("RGBA")
    k = 720 / sit.width * 0.8
    s = sit.resize((round(sit.width * k), round(sit.height * k)), Image.LANCZOS)
    bg = Image.new("RGB", (720, 1280), (0, 255, 0))
    bg.paste(s, ((720 - s.width) // 2, (1280 - s.height) // 2), s)
    bg.save(out)


def videos(cid: str) -> None:
    g = ci.OUT / "themes" / cid / "more"
    dst = fin.SPECIAL / cid
    idle = ("Seamless looping idle animation: the cape and long hair sway softly in a gentle breeze, she blinks slowly once, stars twinkle. "
            "She stays in exactly the same place and pose, the camera does not move, the last frame matches the first frame. ")
    wide = rv.OUT / f"{cid}-idle-stage.mp4"
    try:
        if not wide.exists():
            rv.generate(rv.STYLE + idle, g / "stage-wide.png", wide, 6, "16:9", last=g / "stage-wide.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wide), "-an", "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-vf", "scale=720:-2",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst / "idle-stage.mp4")], check=True)
        print(f"  idle-stage.mp4 {(dst / 'idle-stage.mp4').stat().st_size // 1024}KB", flush=True)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        print(f"  ✗ idle-stage：{e}", flush=True)
    sit = rv.OUT / f"{cid}-idle-sit.mp4"
    try:
        if not sit.exists():
            src = g / "sit-green.png"
            sit_source(cid, src)
            rv.generate(rv.STYLE + idle + "The flat bright green background stays perfectly unchanged.", src, sit, 4, "9:16", last=src)
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(sit), "-vf", "fps=12", f"{tmp}/%03d.png"], check=True)
            files = sorted(Path(tmp).glob("*.png"))
            ref = Image.open(fin.SPECIAL / cid / "sit-smile.webp")
            k = ref.width / (Image.open(files[0]).width * 0.8)
            frames = []
            for f in files:
                im = Image.open(f).convert("RGB")
                w = im.width * 0.8
                h = w * ref.height / ref.width
                box = tuple(round(v) for v in ((im.width - w) / 2, (im.height - h) / 2, (im.width + w) / 2, (im.height + h) / 2))
                frames.append(fin.key_out(im.crop(box), im.getpixel((4, 4))).resize(ref.size, Image.LANCZOS))
            frames[0].save(dst / "idle-sit.webp", save_all=True, append_images=frames[1:], duration=83, loop=0, quality=70, method=4, allow_mixed=True)
        print(f"  idle-sit.webp {(dst / 'idle-sit.webp').stat().st_size // 1024}KB・{k:.2f}", flush=True)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        print(f"  ✗ idle-sit：{e}", flush=True)
    print("✅ 動画", flush=True)


if __name__ == "__main__":
    {"lines": lines, "images": images, "videos": videos}[sys.argv[1]](sys.argv[2] if len(sys.argv) > 2 else "hoshiyomi")
