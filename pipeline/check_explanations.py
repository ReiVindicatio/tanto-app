"""段階6のゲート：解説と公式の○×・条文本文との整合を検査する（決定的）。

検査（1つでも落ちた肢は公開しない）：
  1. 解説の結論 stated_truth が、公式の○×（truth_at_exam.value）と一致する
  2. 条文の引用 quote が、data/statutes/ に保存した本文（指定した項）の部分文字列である
  3. 本文・結論の「」内（6文字以上）が、引用した条文・肢・問題文のどれかに実在する
  4. 本文で触れた条番号（「5条」「98条の2」など）が、すべて citations に入っている
  5. 判例は名前・裁判所・年月日・確認した URL がそろっている
  6. 正本の肢のうち○×があるものに、すべて解説がある（問単位）

使い方：
  python3 pipeline/check_explanations.py yobi 2026 minpo 1      # 検査して結果をファイルに書き戻す
"""
from __future__ import annotations

import argparse
import json
import re
import sys

from common import ROOT
from egov import load_article

EXPLANATIONS = ROOT / "data" / "explanations"
QUESTIONS = ROOT / "data" / "questions"

QUOTE_RE = re.compile(r"「([^「」]+)」")
ARTICLE_REF_RE = re.compile(r"(\d+)条(?:の(\d+))?")


def ws(s: str) -> str:
    return re.sub(r"\s+", "", s)


def check_question(exam: str, year: int, subject: str, number: int) -> tuple[dict, dict[str, list[str]], list[str]]:
    """(解説ファイル, 肢ID→失敗の一覧, 問単位の失敗) を返す。"""
    path = EXPLANATIONS / exam / str(year) / subject / f"q{number:02d}.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    qdoc = json.loads((QUESTIONS / exam / str(year) / f"{subject}.json").read_text(encoding="utf-8"))
    q = next(x for x in qdoc["questions"] if x["id"] == doc["question_id"])
    sts = {s["id"]: s for s in qdoc["statements"] if s["question_id"] == q["id"]}
    question_text = q["stem"] + "".join(c["text"] for c in q["context"])

    failures: dict[str, list[str]] = {}
    for e in doc["explanations"]:
        sid = e["target"]["id"]
        f: list[str] = []
        failures[sid] = f
        s = sts.get(sid)
        if s is None:
            f.append("対象の肢が正本にない")
            continue
        truth = s["truth_at_exam"]
        if truth is None:
            f.append("正本の肢に○×がない")
        elif e.get("stated_truth") is not truth["value"]:
            f.append(f"🔴 公式の○×と食い違う（公式 {'○' if truth['value'] else '×'}／解説 {e.get('stated_truth')}）")

        cited_texts: list[str] = []
        cited_articles: set[str] = set()
        for c in e.get("citations", []):
            if c.get("type") != "statute":
                f.append(f"未知の引用の種類：{c.get('type')}")
                continue
            st = load_article(c["law"], c["article"])
            if st is None:
                f.append(f"条文が保存されていない：{c['law']} {c['article']}（pipeline/egov.py --fetch で取得する）")
                continue
            paras = {p["num"]: p["text"] for p in st["paragraphs"]}
            missing = [n for n in c.get("paragraphs", []) if n not in paras]
            if missing or not c.get("paragraphs"):
                f.append(f"{c['law']} {st['title']}：項の指定が不正 {c.get('paragraphs')}")
                continue
            scope = "".join(paras[n] for n in c["paragraphs"])
            if ws(c["quote"]) not in ws(scope):
                f.append(f"{c['law']} {st['title']}：引用が保存した本文と一致しない「{c['quote'][:30]}…」")
            cited_texts.append(st["text"])
            cited_articles.add(c["article"])
            c["text_sha256"] = st["text_sha256"]
            c["fetched_at"] = st["fetched_at"]
            c["source_url"] = st["url"]

        haystack = ws("".join(cited_texts) + s["text"] + question_text)
        for field in ("conclusion", "body"):
            for quote in QUOTE_RE.findall(e.get(field, "")):
                for part in re.split(r"…+", quote):
                    if len(part) >= 6 and ws(part) not in haystack:
                        f.append(f"{field} の「{part[:20]}」が条文・肢・問題文にない")

        for m in ARTICLE_REF_RE.finditer(e.get("body", "")):
            art = m.group(1) + (f"_{m.group(2)}" if m.group(2) else "")
            if art not in cited_articles:
                f.append(f"本文で触れた {m.group(0)} が citations にない")

        for case in e.get("cases", []):
            lack = [k for k in ("name", "court", "date", "url") if not case.get(k)]
            if lack:
                f.append(f"判例 {case.get('name', '?')}：{lack} がない（確認できない判例は載せない）")

    q_fail = []
    have = {e["target"]["id"] for e in doc["explanations"]}
    need = {sid for sid, s in sts.items() if s["truth_at_exam"]}
    if need - have:
        q_fail.append(f"解説のない肢：{sorted(need - have)}")
    return doc, failures, q_fail


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam")
    ap.add_argument("year", type=int)
    ap.add_argument("subject")
    ap.add_argument("number", type=int)
    args = ap.parse_args()

    doc, failures, q_fail = check_question(args.exam, args.year, args.subject, args.number)
    for e in doc["explanations"]:
        sid = e["target"]["id"]
        e["id"] = f"exp-{sid}"
        e["status"] = "published" if not failures[sid] else "flagged"
        e["check"] = {"passed": not failures[sid], "failures": failures[sid]}
    path = EXPLANATIONS / args.exam / str(args.year) / args.subject / f"q{args.number:02d}.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    bad = 0
    for e in doc["explanations"]:
        f = failures[e["target"]["id"]]
        print(f"{'✅' if not f else '❌'} {e['target']['id']}")
        for x in f:
            print(f"    {x}")
        bad += bool(f)
    for x in q_fail:
        print(f"❌ {x}")
    sys.exit(1 if bad or q_fail else 0)


if __name__ == "__main__":
    main()
