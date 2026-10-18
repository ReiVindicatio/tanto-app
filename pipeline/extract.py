"""段階1：PDF をテキストにする（pdftotext -layout）。

- 入力は sources/manifest.json に載っている PDF。sha256 が manifest と違えば止める
- 出力は data/extracted/ に data/raw/ と同じ構成で <名前>.txt と <名前>.meta.json
  - .txt は pdftotext の出力そのもの（ページ境界は \\f のまま）。AI 補正はかけない
  - .meta.json に方式・ツールの版・ページ境界・品質スコア・科目見出しの位置を残す
- 品質スコアが閾値未満のものは status=needs_ocr とし、後段では使わない

使い方：
  python3 pipeline/extract.py                     # manifest の全件
  python3 pipeline/extract.py --match R08-2026    # path にこの文字列を含むものだけ
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

from common import EXTRACTED as OUT
from common import MANIFEST, RAW, ROOT, sha256

PDFTOTEXT_ARGS = ["-layout", "-enc", "UTF-8"]
QUALITY_THRESHOLD = 0.97

# 予備の科目群ファイルを分割するための見出し（行全体がこれだけのもの）
SUBJECT_HEADINGS = ["憲法", "行政法", "民法", "商法", "民事訴訟法", "刑法", "刑事訴訟法"]
HEADING_RE = re.compile(r"^\s*［\s*(" + "|".join(SUBJECT_HEADINGS) + r")\s*］\s*$")

# 「正常な文字」とみなす範囲（棚卸し docs/inventory.md の判定と同じ考え方）
NORMAL_RANGES = [
    (0x0021, 0x007E),  # ASCII
    (0x00D7, 0x00D7),  # ×（○×式の解答欄）
    (0x0391, 0x03C9),  # ギリシャ文字（人物の記号 α・β など）
    (0x2010, 0x206F),  # 一般句読点（―・…など）
    (0x2116, 0x2116),  # №
    (0x2160, 0x217F),  # ローマ数字
    (0x2190, 0x22FF),  # 矢印・数学記号（≦など）
    (0x2460, 0x24FF),  # 丸数字
    (0x2500, 0x257F),  # 罫線
    (0x25A0, 0x25FF),  # 図形（○△□など）
    (0x3000, 0x303F),  # 和文の句読点・括弧
    (0x3040, 0x309F),  # ひらがな
    (0x30A0, 0x30FF),  # カタカナ
    (0x4E00, 0x9FFF),  # 漢字
    (0xFF01, 0xFF9F),  # 全角英数・半角カナ
]


def is_normal(ch: str) -> bool:
    c = ord(ch)
    return any(lo <= c <= hi for lo, hi in NORMAL_RANGES)


def quality(text: str) -> tuple[float, int]:
    chars = [ch for ch in text if not ch.isspace()]
    if not chars:
        return 0.0, 0
    return sum(is_normal(ch) for ch in chars) / len(chars), len(chars)


def pdftotext_version() -> str:
    r = subprocess.run(["pdftotext", "-v"], capture_output=True, text=True)
    return (r.stderr or r.stdout).splitlines()[0].strip()


def find_sections(lines: list[str]) -> list[dict]:
    """科目見出し（［刑法］など）の行から、科目ごとの行範囲を返す（0始まり・end は含まない）。"""
    heads = [(i, m.group(1)) for i, line in enumerate(lines) if (m := HEADING_RE.match(line))]
    sections = []
    for k, (i, name) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        sections.append({"subject": name, "start_line": i, "end_line": end})
    return sections


def extract(entry: dict, tool_version: str) -> dict:
    pdf = ROOT / entry["path"]
    actual = sha256(pdf)
    if actual != entry["sha256"]:
        raise SystemExit(f"🔴 sha256 が manifest と違う：{entry['path']}\n  manifest={entry['sha256']}\n  actual  ={actual}")

    r = subprocess.run(["pdftotext", *PDFTOTEXT_ARGS, str(pdf), "-"], capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f"🔴 pdftotext が失敗：{entry['path']}\n{r.stderr.decode(errors='replace')}")
    text = r.stdout.decode("utf-8")

    pages = text.split("\f")
    if pages and pages[-1].strip() == "":
        pages = pages[:-1]
    lines = text.split("\n")
    page_start_lines = []
    n = 0
    for p in pages:
        page_start_lines.append(n)
        n += p.count("\n")

    score, nchars = quality(text)
    page_scores = [round(quality(p)[0], 4) for p in pages]
    status = "ok" if score >= QUALITY_THRESHOLD and nchars > 0 else "needs_ocr"

    rel = pdf.relative_to(RAW)
    out_txt = OUT / rel.with_suffix(".txt")
    out_meta = OUT / rel.with_suffix(".meta.json")
    out_txt.parent.mkdir(parents=True, exist_ok=True)
    out_txt.write_text(text, encoding="utf-8")

    meta = {
        "source": {"path": entry["path"], "sha256": entry["sha256"], "source_url": entry.get("source_url")},
        "method": "pdftotext",
        "tool": {"version": tool_version, "args": PDFTOTEXT_ARGS},
        "status": status,
        "quality": {"normal_char_ratio": round(score, 4), "nonspace_chars": nchars,
                    "threshold": QUALITY_THRESHOLD, "per_page": page_scores},
        "pages": len(pages),
        "page_start_lines": page_start_lines,
        "sections": find_sections(lines) if status == "ok" else [],
    }
    out_meta.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="", help="manifest の path にこの文字列を含むものだけ処理する")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = [e for e in manifest["files"] if args.match in e["path"]]
    if not entries:
        sys.exit(f"manifest に一致なし：{args.match}")

    version = pdftotext_version()
    bad = []
    for e in entries:
        meta = extract(e, version)
        mark = "✅" if meta["status"] == "ok" else "🔴"
        secs = ",".join(s["subject"] for s in meta["sections"])
        print(f"{mark} {meta['quality']['normal_char_ratio']:.3f} p{meta['pages']:>2} {e['path'].removeprefix('data/raw/')} {secs}")
        if meta["status"] != "ok":
            bad.append(e["path"])
    print(f"\n{len(entries)}件中 needs_ocr {len(bad)}件")


if __name__ == "__main__":
    main()
