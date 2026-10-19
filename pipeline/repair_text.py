"""段階1の補助：テキスト層が壊れた PDF を、OCR や AI を使わずに決定的に復元する（T010・決定017）。

extract.py で needs_ocr になった PDF のうち、原因が分かっていて機械的に直せるものだけを扱う。
PDF の一時コピーを直してから pdftotext にかけ、出力は extract.py と同じ（data/extracted/ の <名前>.txt・
<名前>.meta.json）。meta に復元の手順と検査の結果を残す。data/raw/ の PDF は変えない。

手順（REPAIRS で PDF ごとに指定し、この順にかける）：
- drop_clipped：見えている文字とは別に、クリップで隠れた文字の層がある（H25・H26 憲法行政法。InDesign で
  貼り込まれた一般教養の PDF の文字が、ページ下端の帯にクリップされている）。クリップの矩形の外から始まる文字を除く。
  検査：除いた文字がすべて、文字の対応表（ToUnicode）のないフォントのもの（見えている本文を誤って除かない）
- fontmap：文字コードが MS 明朝・MS ゴシックの字形番号（GID）のままで、ToUnicode がない（R07 の全体、
  H25・H26 のページ番号と H26 の1ページ）。手元の同じ版のフォントの cmap から GID → 文字の ToUnicode を作って足す。
  （pdftotext の出力を後から置き換える方式は採らない：字形番号がアラビア文字などの範囲に当たると、pdftotext が
  右から左の文字として並べ替えてしまう。R07 憲法行政法の「ア○ イ○ ウ○」で起きた）
  検査：①埋め込まれた字形が、手元のフォントの同じ番号の字形と一致する（TrueType は輪郭の座標が完全に一致。
       CFF に変換されたものは面積・重心・広がりが許容差の範囲で一致）＝番号の付け方が同じフォントである
       ②どの GID も文字がちょうど1つに決まる
最後に、復元後の品質スコアが閾値以上であることを確かめる。

標準ライブラリだけでは読めないので、この段だけ pypdf・fontTools（pipeline/requirements-repair.txt）と、
Microsoft Office に同梱の MS 明朝・MS ゴシックが要る（フォントは commit しない）。
復元した結果は commit するので、段階2以降（regen.py・CI）はこれらなしで動く。

使い方：
  python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements-repair.txt
  .venv/bin/python pipeline/repair_text.py --match R07-2025
"""
from __future__ import annotations

import argparse
import collections
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools import version as FONTTOOLS_VERSION
from fontTools.cffLib import CFFFontSet
from fontTools.pens.statisticsPen import StatisticsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTCollection, TTFont
from pypdf import PdfWriter
from pypdf import __version__ as PYPDF_VERSION
from pypdf.generic import ContentStream, DecodedStreamObject, NameObject

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import EXTRACTED as OUT  # noqa: E402
from common import MANIFEST, RAW, ROOT, sha256  # noqa: E402
from extract import PDFTOTEXT_ARGS, QUALITY_THRESHOLD, find_sections, pdftotext_version, quality  # noqa: E402

FONT_DIR = Path("/Applications/Microsoft Word.app/Contents/Resources/DFonts")
LOCAL_FONTS = {"MS-Mincho": ("msmincho.ttc", "MS Mincho"), "MS-Gothic": ("msgothic.ttc", "MS Gothic")}

REPAIRS = {
    "data/raw/予備試験/短答/R07-2025/民法商法民事訴訟法_問題.pdf": ["fontmap"],
    "data/raw/予備試験/短答/R07-2025/刑法刑事訴訟法_問題.pdf": ["fontmap"],
    "data/raw/予備試験/短答/R07-2025/憲法行政法_問題.pdf": ["fontmap"],
    "data/raw/予備試験/短答/H25-2013/憲法行政法_問題.pdf": ["drop_clipped", "fontmap"],
    "data/raw/予備試験/短答/H26-2014/憲法行政法_問題.pdf": ["drop_clipped", "fontmap"],
}
WHITESPACE = " \n\f"
# CFF に変換された字形と元の TrueType の字形の比べ方（1000 単位で）。変換で曲線が近似されるので完全には一致しない
CFF_AREA_TOL = 0.03
CFF_MOMENT_TOL = 5.0


class RepairError(Exception):
    pass


def page_fonts(page) -> dict:
    fonts = page["/Resources"].get("/Font")
    return fonts.get_object() if fonts else {}


def font_key(fonts, name) -> int:
    ref = fonts.raw_get(name)
    if not hasattr(ref, "idnum"):
        raise RepairError(f"フォント {name} が間接参照でない")
    return ref.idnum


def font_name(f) -> str:
    name = str(f["/BaseFont"])
    try:
        return name.encode("cp1252").decode("cp932")  # 「ＭＳ明朝」などが Shift_JIS のまま入っている
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def check_no_xobject(page) -> None:
    if page["/Resources"].get("/XObject"):
        raise RepairError("XObject のあるページは未対応")


# ---- drop_clipped ----

def mul(a, b):
    """アフィン変換の積 a×b（PDF の [a b c d e f]）"""
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def rect_bbox(ctm, x, y, w, h):
    pts = [apply(ctm, px, py) for px, py in ((x, y), (x + w, y), (x, y + h), (x + w, y + h))]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return [min(xs), min(ys), max(xs), max(ys)]


def intersect(a, b):
    if a is None:
        return b
    return [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]


IDENTITY = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
CLIP_TOL = 1.0  # クリップの境目の許容（ポイント）
PATH_OPS = {b"m", b"l", b"c", b"v", b"y", b"h"}
PAINT_OPS = {b"n", b"f", b"F", b"f*", b"S", b"s", b"B", b"B*", b"b", b"b*"}
SHOW_OPS = {b"Tj", b"TJ", b"'", b'"'}


def drop_clipped_page(pdf, page) -> collections.Counter:
    """クリップの矩形の外から始まる文字の描画を除く。除いた／残した数を (除いたか, ToUnicode があるか) ごとに返す"""
    check_no_xobject(page)
    fonts = page_fonts(page)
    st = {"ctm": list(IDENTITY), "clip": None, "font": None, "TL": 0.0}
    stack = []
    rects, other, pending = [], False, False
    tm = tlm = list(IDENTITY)
    counts = collections.Counter()
    out = []
    cs = ContentStream(page.get_contents(), pdf)
    for ops, op in cs.operations:
        nums = [float(x) for x in ops] if op in (b"cm", b"re", b"Tm", b"Td", b"TD", b"TL") else None
        if op == b"q":
            stack.append(dict(st))
        elif op == b"Q":
            st = stack.pop()
        elif op == b"cm":
            st["ctm"] = mul(nums, st["ctm"])
        elif op == b"re":
            rects.append(rect_bbox(st["ctm"], *nums))
        elif op in PATH_OPS:
            other = True
        elif op in (b"W", b"W*"):
            pending = True
        elif op in PAINT_OPS:
            if pending:
                if other or len(rects) != 1:
                    raise RepairError("矩形でないクリップは未対応")
                st["clip"] = intersect(st["clip"], rects[0])
            rects, other, pending = [], False, False
        elif op == b"BT":
            tm = tlm = list(IDENTITY)
        elif op == b"Tf":
            st["font"] = ops[0]
        elif op == b"TL":
            st["TL"] = nums[0]
        elif op == b"Tm":
            tm = tlm = nums
        elif op in (b"Td", b"TD"):
            if op == b"TD":
                st["TL"] = -nums[1]
            tm = tlm = mul([1, 0, 0, 1, nums[0], nums[1]], tlm)
        elif op in (b"T*", b"'", b'"'):
            tm = tlm = mul([1, 0, 0, 1, 0, -st["TL"]], tlm)
        if op in SHOW_OPS:
            x, y = apply(st["ctm"], tm[4], tm[5])
            c = st["clip"]
            visible = c is None or (c[0] - CLIP_TOL <= x <= c[2] + CLIP_TOL and c[1] - CLIP_TOL <= y <= c[3] + CLIP_TOL)
            counts[(not visible, "/ToUnicode" in fonts[st["font"]].get_object())] += 1
            if not visible:
                continue
        out.append((ops, op))
    cs.operations = out
    page.replace_contents(cs)
    return counts


def drop_clipped(writer: PdfWriter) -> dict:
    counts = collections.Counter()
    for page in writer.pages:
        counts.update(drop_clipped_page(writer, page))
    if counts[(True, True)]:
        raise RepairError(f"ToUnicode のある（見えているはずの）文字を {counts[(True, True)]} 個除こうとした")
    return {"dropped_text_ops": counts[(True, False)], "kept_text_ops": counts[(False, True)] + counts[(False, False)]}


# ---- fontmap ----

def used_codes(writer: PdfWriter) -> tuple[dict[int, set[int]], dict[int, object]]:
    """ToUnicode のない CID フォント（オブジェクト番号）ごとに、本文で使われた文字コード（2バイト）の集合"""
    used: dict[int, set[int]] = collections.defaultdict(set)
    objs: dict[int, object] = {}
    for page in writer.pages:
        check_no_xobject(page)
        fonts = page_fonts(page)
        cur, stack = None, []
        for ops, op in ContentStream(page.get_contents(), writer).operations:
            if op == b"q":
                stack.append(cur)
            elif op == b"Q":
                cur = stack.pop() if stack else cur
            elif op == b"Tf":
                f = fonts[ops[0]].get_object()
                cur = font_key(fonts, ops[0]) if "/DescendantFonts" in f and "/ToUnicode" not in f else None
                if cur is not None:
                    objs[cur] = f
            elif op in SHOW_OPS and cur is not None:
                strings = [x for x in ops[0] if hasattr(x, "original_bytes")] if op == b"TJ" else [ops[-1]]
                for s in strings:
                    b = s.original_bytes
                    used[cur].update(int.from_bytes(b[i:i + 2], "big") for i in range(0, len(b), 2))
    return used, objs


def load_local(family: str) -> TTFont:
    fn, name = LOCAL_FONTS[family]
    path = FONT_DIR / fn
    if not path.exists():
        raise RepairError(f"手元のフォントがない：{path}（Microsoft Office に同梱）")
    return next(f for f in TTCollection(str(path)).fonts if f["name"].getDebugName(4) == name)


def outline(glyf, order, gid):
    coords, ends, flags = glyf[order[gid]].getCoordinates(glyf)
    return list(coords), list(ends), list(flags)


def moments(draw, scale: float) -> tuple[float, ...]:
    sp = StatisticsPen()
    draw(TransformPen(sp, (scale, 0, 0, scale, 0, 0)))
    return abs(sp.area), sp.meanX, sp.meanY, sp.stddevX, sp.stddevY


def moments_close(a, b) -> bool:
    if a[0] == 0 or b[0] == 0:
        return a[0] == b[0]
    return abs(a[0] - b[0]) <= CFF_AREA_TOL * max(a[0], b[0]) and all(abs(x - y) <= CFF_MOMENT_TOL for x, y in zip(a[1:], b[1:]))


def verify_font(f, codes: set[int]) -> tuple[TTFont, dict]:
    """埋め込みの字形が、手元のフォントの同じ番号の字形と一致することを確かめる"""
    base = font_name(f)
    family = next((k for k in LOCAL_FONTS if k in base or LOCAL_FONTS[k][1].replace(" ", "") in base), None)
    if family is None:
        family = "MS-Gothic" if "ゴシック" in base else "MS-Mincho" if "明朝" in base else None
    if family is None:
        raise RepairError(f"{base}：MS 明朝・MS ゴシック以外のフォント")
    local = load_local(family)
    lg, lo = local["glyf"], local.getGlyphOrder()
    desc = f["/DescendantFonts"][0].get_object()
    fd = desc["/FontDescriptor"].get_object()
    if any(c >= len(lo) for c in codes):
        raise RepairError(f"{base}：手元のフォントにない字形番号")
    if "/FontFile2" in fd:
        if desc.get("/CIDToGIDMap") not in (None, "/Identity"):
            raise RepairError(f"{base}：CIDToGIDMap が Identity でない")
        emb = TTFont(io.BytesIO(fd["/FontFile2"].get_object().get_data()))
        eg, eo = emb["glyf"], emb.getGlyphOrder()
        bad = [c for c in codes if c >= len(eo) or outline(eg, eo, c) != outline(lg, lo, c)]
        check = "TrueType の輪郭の座標が完全に一致"
    elif "/FontFile3" in fd:
        cff = CFFFontSet()
        cff.decompile(io.BytesIO(fd["/FontFile3"].get_object().get_data()), None)
        top = cff[cff.fontNames[0]]
        if getattr(top, "ROS", None) != ("Adobe", "Identity", 0):
            raise RepairError(f"{base}：CFF の ROS が Adobe-Identity-0 でない")
        cs, gs = top.CharStrings, local.getGlyphSet()
        scale = 1000 / local["head"].unitsPerEm
        bad = [c for c in codes
               if f"cid{c:05d}" not in cs or not moments_close(moments(cs[f"cid{c:05d}"].draw, 1.0), moments(gs[lo[c]].draw, scale))]
        check = f"CFF の字形の面積（差{CFF_AREA_TOL:.0%}以内）・重心と広がり（差{CFF_MOMENT_TOL:g}/1000以内）が一致"
    else:
        raise RepairError(f"{base}：埋め込みフォントがない")
    if bad:
        raise RepairError(f"{base}：{len(bad)}/{len(codes)} 字形が手元のフォントと一致しない（例 {sorted(bad)[:5]}）")
    return local, {"pdf_font": base, "local_font": f"{local['name'].getDebugName(4)} {local['name'].getDebugName(5)}",
                   "glyphs": len(codes), "check": check}


def to_unicode_cmap(table: dict[int, str]) -> bytes:
    items = sorted(table.items())
    lines = ["/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
             "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
             "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def",
             "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange"]
    for k in range(0, len(items), 100):
        chunk = items[k:k + 100]
        lines.append(f"{len(chunk)} beginbfchar")
        lines += [f"<{g:04X}> <{ch.encode('utf-16-be').hex().upper()}>" for g, ch in chunk]
        lines.append("endbfchar")
    lines += ["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"]
    return "\n".join(lines).encode("ascii")


def fontmap(writer: PdfWriter) -> dict:
    used, objs = used_codes(writer)
    fonts = []
    for fid, codes in sorted(used.items()):
        local, info = verify_font(objs[fid], codes)
        rev: dict[int, set[int]] = collections.defaultdict(set)
        for u, gname in local.getBestCmap().items():
            rev[local.getGlyphID(gname)].add(u)
        table = {}
        for g in sorted(codes):
            if len(rev.get(g, ())) != 1:
                raise RepairError(f"{info['pdf_font']}：GID {g} の文字が {len(rev.get(g, ()))} 通り")
            table[g] = chr(next(iter(rev[g])))
        stream = DecodedStreamObject()
        stream.set_data(to_unicode_cmap(table))
        objs[fid][NameObject("/ToUnicode")] = writer._add_object(stream)
        fonts.append(info)
    return {"fonts": fonts}


# ---- 共通 ----

STEPS = {"drop_clipped": drop_clipped, "fontmap": fontmap}


def run_pdftotext(pdf: Path) -> str:
    r = subprocess.run(["pdftotext", *PDFTOTEXT_ARGS, str(pdf), "-"], capture_output=True)
    if r.returncode != 0:
        raise RepairError(f"pdftotext が失敗：{r.stderr.decode(errors='replace')}")
    return r.stdout.decode("utf-8")


def repair(entry: dict, steps: list[str]) -> dict:
    pdf = ROOT / entry["path"]
    if sha256(pdf) != entry["sha256"]:
        raise RepairError("sha256 が manifest と違う")
    writer = PdfWriter(clone_from=str(pdf))
    detail = {step: STEPS[step](writer) for step in steps}
    with tempfile.TemporaryDirectory() as tmp:
        fixed = Path(tmp) / "fixed.pdf"
        with open(fixed, "wb") as fh:
            writer.write(fh)
        text = run_pdftotext(fixed)

    pages = text.split("\f")
    if pages and pages[-1].strip() == "":
        pages = pages[:-1]
    page_start_lines, n = [], 0
    for p in pages:
        page_start_lines.append(n)
        n += p.count("\n")
    score, nchars = quality(text)
    if score < QUALITY_THRESHOLD:
        raise RepairError(f"復元後の品質スコアが閾値未満：{score:.4f}")

    out_txt = OUT / pdf.relative_to(RAW).with_suffix(".txt")
    out_txt.write_text(text, encoding="utf-8")
    meta = {
        "source": {"path": entry["path"], "sha256": entry["sha256"], "source_url": entry.get("source_url")},
        "method": "pdftotext+" + "+".join(steps),
        "tool": {"version": pdftotext_version(), "args": PDFTOTEXT_ARGS,
                 "repair": {"script": "pipeline/repair_text.py", "pypdf": PYPDF_VERSION, "fonttools": FONTTOOLS_VERSION}},
        "status": "ok",
        "repair": detail,
        "quality": {"normal_char_ratio": round(score, 4), "nonspace_chars": nchars,
                    "threshold": QUALITY_THRESHOLD, "per_page": [round(quality(p)[0], 4) for p in pages]},
        "pages": len(pages),
        "page_start_lines": page_start_lines,
        "sections": find_sections(text.split("\n")),
        "tsv": None,
    }
    out_txt.with_suffix(".meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="", help="path にこの文字列を含むものだけ処理する")
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = [e for e in manifest["files"] if e["path"] in REPAIRS and args.match in e["path"]]
    if not entries:
        sys.exit(f"REPAIRS に一致なし：{args.match}")
    failed = 0
    for e in entries:
        try:
            meta = repair(e, REPAIRS[e["path"]])
        except RepairError as err:
            failed += 1
            print(f"🔴 {e['path'].removeprefix('data/raw/')}：{err}")
            continue
        fonts = meta["repair"].get("fontmap", {}).get("fonts", [])
        dropped = meta["repair"].get("drop_clipped", {}).get("dropped_text_ops")
        print(f"✅ {meta['quality']['normal_char_ratio']:.3f} p{meta['pages']:>2} {e['path'].removeprefix('data/raw/')} "
              f"{','.join(s['subject'] for s in meta['sections'])}  字形の照合 {sum(f['glyphs'] for f in fonts)}"
              + (f"・隠れた文字の描画を除去 {dropped}" if dropped is not None else ""))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
