"""段階2b：正答 PDF の表を構造化する（決定的）。

正答表は2段組（または1段）で、「問」「配点」「備考」のセルが複数の No 行にまたがって縦に結合されている。
-layout の文字並びでは結合セルの位置がずれるので、pdftotext -tsv の座標で読む。

- 列：見出し行（問・No・解答・配点・備考）の x 座標に、各語を最も近い列として割り当てる
- 行：No 列の語が1行
- 結合セル：問の番号は、その問の No 行の範囲の縦の中央に置かれている。
  これを使って、問ごとの No の範囲を決める（中央が合わなければ止める）

使い方：
  python3 pipeline/parse_answers.py R08-2026 刑法刑事訴訟法
"""
from __future__ import annotations

import argparse
import re
import statistics
import subprocess
import sys
from dataclasses import dataclass

from common import EXAM_IDS, GROUP_IDS, PARSED, ROOT, manifest_entry, nfkc, write_json, year_parts

HEADER_WORDS = {"問": "q", "No": "no", "№": "no", "解答": "ans", "配点": "pts", "備": "rem", "考": "rem2", "備考": "rem"}
CENTER_TOL = 3.0  # 結合セルの中央と No 行の範囲の中央の許容差（pt）


@dataclass
class Word:
    page: int
    x: float
    y: float
    w: float
    h: float
    text: str

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


def read_words(pdf) -> list[Word]:
    r = subprocess.run(["pdftotext", "-tsv", str(pdf), "-"], capture_output=True, text=True, check=True)
    words = []
    for line in r.stdout.splitlines()[1:]:
        f = line.split("\t")
        if f[0] != "5":
            continue
        words.append(Word(int(f[1]), float(f[6]), float(f[7]), float(f[8]), float(f[9]), f[11]))
    return words


def head_key(text: str) -> str:
    """見出しの表記ゆれ（Ｎｏ.／No／№）をそろえる。"""
    t = nfkc(text.replace("№", "No")).replace(" ", "")
    return t.rstrip(".")


def columns_for_page(words: list[Word]) -> tuple[float, list[tuple[str, int, float]]]:
    """見出し行の y と、列の一覧 [(種類, 段の番号, x中央)] を返す。"""
    ans_heads = [w for w in words if w.text == "解答"]
    if not ans_heads:
        raise ValueError("見出し行（解答）がない")
    hy = min(w.cy for w in ans_heads)
    heads = sorted((w for w in words if abs(w.cy - hy) < 2 and head_key(w.text) in HEADER_WORDS), key=lambda w: w.x)
    cols: list[tuple[str, int, float]] = []
    side = -1
    pending_rem = None
    for w in heads:
        kind = HEADER_WORDS[head_key(w.text)]
        if kind == "q":
            side += 1
        if kind == "rem2":  # 「備」「考」が別の語になっている
            if pending_rem is None:
                raise ValueError("「考」の前に「備」がない")
            cols.append(("rem", side, (pending_rem.cx + w.cx) / 2))
            pending_rem = None
            continue
        if kind == "rem" and head_key(w.text) == "備":
            pending_rem = w
            continue
        cols.append((kind, side, w.cx))
    if pending_rem is not None:
        cols.append(("rem", side, pending_rem.cx))
    return hy, cols


def parse(pdf) -> list[dict]:
    words = read_words(pdf)
    questions: list[dict] = []
    for page in sorted({w.page for w in words}):
        pw = [w for w in words if w.page == page]
        hy, cols = columns_for_page(pw)
        body = [w for w in pw if w.cy > hy + 5]
        cells: dict[tuple[str, int], list[Word]] = {}
        for w in body:
            kind, side, _ = min(cols, key=lambda c: abs(c[2] - w.cx))
            if not nfkc(w.text).isdigit():
                kind = "rem"  # 問・No・解答・配点の欄は数字だけ。備考の文字が左に寄っていても備考に入れる
            cells.setdefault((kind, side), []).append(w)
        for side in sorted({c[1] for c in cols}):
            questions += parse_side(cells, side, page)
    return questions


def parse_side(cells, side: int, page: int) -> list[dict]:
    where = f"p{page} 段{side + 1}"
    nos = sorted(cells.get(("no", side), []), key=lambda w: w.cy)
    if not nos:
        return []
    ans = cells.get(("ans", side), [])
    rows = []
    for n in nos:
        hit = [a for a in ans if abs(a.cy - n.cy) < 3]
        if len(hit) != 1:
            raise ValueError(f"{where} No.{n.text}：解答の語が {len(hit)} 個")
        rows.append({"no": int(nfkc(n.text)), "y": n.cy, "answer_raw": hit[0].text})
    pitch = statistics.median(b["y"] - a["y"] for a, b in zip(rows, rows[1:])) if len(rows) > 1 else 18.0

    labels = sorted(cells.get(("q", side), []), key=lambda w: w.cy)
    out = []
    i = 0
    for lab in labels:
        s = i
        e = s
        while e < len(rows) and (rows[s]["y"] + rows[e]["y"]) / 2 < lab.cy - CENTER_TOL:
            e += 1
        if e >= len(rows) or abs((rows[s]["y"] + rows[e]["y"]) / 2 - lab.cy) > CENTER_TOL:
            raise ValueError(f"{where} 問{lab.text}：No 行の範囲の中央に合わない（y={lab.cy:.1f}）")
        span = rows[s:e + 1]
        i = e + 1
        lo, hi = span[0]["y"] - pitch / 2, span[-1]["y"] + pitch / 2
        pts = [w for w in cells.get(("pts", side), []) if lo < w.cy < hi]
        if len(pts) != 1:
            raise ValueError(f"{where} 問{lab.text}：配点の語が {len(pts)} 個")
        rem_words = sorted((w for w in cells.get(("rem", side), []) if lo < w.cy < hi), key=lambda w: (round(w.cy), w.x))
        remarks = "".join(w.text for w in rem_words)
        out.append(build_question(int(nfkc(lab.text)), int(nfkc(pts[0].text)), span, remarks, page))
    if i != len(rows):
        raise ValueError(f"{where}：どの問にも属さない No 行がある（No.{rows[i]['no']}〜）")
    used = sum(1 for w in cells.get(("pts", side), []))
    if used != len(labels):
        raise ValueError(f"{where}：配点の語 {used} 個に対して問 {len(labels)} 個")
    return out


PARTIAL_RE = re.compile(r"(\d+)問正解で部分点(\d+)点")
# 順不同の問の「（部分点1点）」：No が2つの問で1つ正解のときの部分点と読む
UNORDERED_PARTIAL_RE = re.compile(r"^順不同\(部分点(\d+)点\)$")


def build_question(number: int, points: int, span: list[dict], remarks: str, page: int) -> dict:
    r = nfkc(remarks)
    m = PARTIAL_RE.search(r)
    partial = {"correct_needed": int(m.group(1)), "points": int(m.group(2))} if m else None
    mu = UNORDERED_PARTIAL_RE.match(r)
    if mu:
        if len(span) != 2:
            raise ValueError(f"問{number}：順不同（部分点）の No が2つでない（{len(span)}個）")
        partial = {"correct_needed": 1, "points": int(mu.group(1)), "inferred_from": "順不同（部分点N点）"}
    slots = []
    for row in span:
        raw = row["answer_raw"]
        v = nfkc(raw)
        slots.append({"no": row["no"], "answer": int(v) if v.isdigit() else None, "answer_raw": raw})
    return {
        "number": number,
        "points": points,
        "slots": slots,
        "unordered": "順不同" in r,
        "partial_credit": partial,
        "no_partial_credit": "部分点なし" in r,
        "remarks_raw": remarks,
        "page": page,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("year", help="例：R08-2026")
    ap.add_argument("group", help="例：刑法刑事訴訟法")
    ap.add_argument("--exam", default="予備試験")
    args = ap.parse_args()

    rel = f"data/raw/{args.exam}/短答/{args.year}/{args.group}_正答.pdf"
    entry = manifest_entry(rel)
    try:
        questions = parse(ROOT / rel)
    except ValueError as e:
        sys.exit(f"🔴 正答表のパースで停止：{e}")
    if not questions:
        sys.exit("🔴 正答表から問を1つも読めなかった（見出し行の様式が違う可能性）")

    era, year = year_parts(args.year)
    out = PARSED / EXAM_IDS[args.exam] / str(year) / f"answers-{GROUP_IDS[args.group]}.json"
    write_json(out, {
        "source": {"path": rel, "sha256": entry["sha256"], "source_url": entry.get("source_url")},
        "method": "pdftotext -tsv（座標で列と結合セルを判定）",
        "exam": {"type": EXAM_IDS[args.exam], "year": year, "era": era},
        "group": args.group,
        "questions": questions,
    })
    nslots = sum(len(q["slots"]) for q in questions)
    print(f"✅ {out.relative_to(ROOT)}：{len(questions)}問・{nslots} No・配点計 {sum(q['points'] for q in questions)}")


if __name__ == "__main__":
    main()
