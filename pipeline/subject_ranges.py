"""司法 H23〜H26 の問題冊子（科目系ごと。科目の見出しがない）で、問ごとの科目の範囲を決める（T036・決定019）。

法務省の資料に問番号と科目の対応はない。そこで、同じ年度の予備（科目の見出しがある）と同じ肢を持つ問の科目を手がかりにする。
- 予備と同じ肢から科目が分かる問を並べ、科目が決まった順（ORDER）にひと続きで並ぶことを確かめる（混ざる・食い違うなら止める）
- 科目 A の最後の確定問と、次の科目 B の最初の確定問の間の問は決まらない。法務省の資料に科目ごとの問数があれば（OFFICIAL_COUNTS）
  それで決め、なければ取り込まない（excluded）
- 最初の科目の前・最後の科目の後の問は、ひと続きであることから、それぞれ最初・最後の科目とする
結果は pipeline/subject_ranges.json に書く（parse_questions.py が読む）。

使い方：
  python3 pipeline/subject_ranges.py
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata

from common import EXTRACTED, PARSED, ROOT, SUBJECT_IDS

OUT = ROOT / "pipeline" / "subject_ranges.json"
YEARS = ["H23-2011", "H24-2012", "H25-2013", "H26-2014"]
ORDER = {"公法系科目": ["憲法", "行政法"], "民事系科目": ["民法", "商法", "民事訴訟法"], "刑事系科目": ["刑法", "刑事訴訟法"]}
# 法務省の資料にある科目ごとの問数（第103回司法試験委員会 資料2「幹事による報告資料」資料2-3。H25 だけ）
OFFICIAL_COUNTS = {
    ("H25-2013", "公法系科目"): {"憲法": 20, "行政法": 20},
    ("H25-2013", "民事系科目"): {"民法": 36, "商法": 19, "民事訴訟法": 19},
    ("H25-2013", "刑事系科目"): {"刑法": 20, "刑事訴訟法": 20},
}
OFFICIAL_SOURCE = "https://www.moj.go.jp/content/000126837.pdf（第103回司法試験委員会 資料2-3）"
KEY_LEN = 25
HEAD_RE = re.compile(r"〔第\s*([0-9０-９]+)\s*問\s*〕")
STATEMENT_RE = re.compile(r"^\s*[アイウエオカキクケコ1-9１-９][．.]\s*(.+(?:\n\s{4,}.+)*)", re.M)


def key(text: str) -> str:
    return re.sub(r"[\s、，。．,.]", "", unicodedata.normalize("NFKC", text))[:KEY_LEN]


def yobi_keys(year: int) -> dict[str, str]:
    name = {v: k for k, v in SUBJECT_IDS.items()}
    out = {}
    for path in (PARSED / "yobi" / str(year)).glob("*.json"):
        if path.name.startswith("answers"):
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        for q in doc["questions"]:
            for s in q["statements"]:
                out[key(s["text"])] = name[doc["subject"]]
    return out


def ranges_for(year_dir: str, group: str) -> dict:
    year = int(year_dir.split("-")[1])
    known = yobi_keys(year)
    text = (EXTRACTED / "司法試験" / "短答" / year_dir / f"{group}_問題.txt").read_text(encoding="utf-8")
    parts = HEAD_RE.split(text)
    seq = []  # 問番号の順に、予備から分かる科目（分からなければ None）
    for i in range(1, len(parts), 2):
        number = int(unicodedata.normalize("NFKC", parts[i]))
        subs = {known[k] for m in STATEMENT_RE.finditer(parts[i + 1]) if (k := key(m.group(1))) in known}
        if len(subs) > 1:
            raise SystemExit(f"🔴 {year_dir} {group} 第{number}問：予備の別々の科目の肢を含む {subs}")
        seq.append((number, subs.pop() if subs else None))
    if [n for n, _ in seq] != list(range(1, len(seq) + 1)):
        raise SystemExit(f"🔴 {year_dir} {group}：問番号が連番でない")
    order = ORDER[group]
    labels = [s for _, s in seq if s]
    if labels != sorted(labels, key=order.index) or set(labels) != set(order):
        raise SystemExit(f"🔴 {year_dir} {group}：予備から分かる科目が決まった順にひと続きで並ばない")
    first = {s: next(n for n, x in seq if x == s) for s in order}
    last = {s: max(n for n, x in seq if x == s) for s in order}
    counts = OFFICIAL_COUNTS.get((year_dir, group))
    ranges, excluded = [], []
    for k, s in enumerate(order):
        start = 1 if k == 0 else None
        end = len(seq) if k == len(order) - 1 else None
        if counts:
            start = sum(counts[x] for x in order[:k]) + 1
            end = start + counts[s] - 1
            if not (start <= first[s] and last[s] <= end):
                raise SystemExit(f"🔴 {year_dir} {group} {s}：公式の問数と予備から分かる範囲が合わない")
        ranges.append({"subject": s, "from": start or first[s], "to": end or last[s]})
    if counts:
        basis = f"予備と同じ肢から分かる科目の並び＋法務省の資料の科目ごとの問数（{OFFICIAL_SOURCE}）"
    else:
        basis = "予備と同じ肢から分かる科目の並び（境目で決まらない問は取り込まない）"
        for a, b in zip(ranges, ranges[1:]):
            excluded += list(range(a["to"] + 1, b["from"]))
    return {"questions": len(seq), "ranges": ranges, "excluded": excluded, "basis": basis,
            "known": sum(1 for _, s in seq if s)}


def main() -> None:
    out = {"note": "司法 H23〜H26 の科目系の問題冊子の、問番号と科目の対応（pipeline/subject_ranges.py が作る。手で書き換えない）。決定019",
           "ranges": {}}
    for y in YEARS:
        for g in ORDER:
            r = ranges_for(y, g)
            out["ranges"][f"{y}/{g}"] = r
            desc = "・".join(f"{x['subject']} {x['from']}〜{x['to']}" for x in r["ranges"])
            print(f"✅ {y} {g}（{r['questions']}問・予備と照合 {r['known']}問）：{desc}" + (f"／取り込まない {r['excluded']}" if r["excluded"] else ""))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
