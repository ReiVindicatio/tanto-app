"""段階6のゲート：解説と公式の○×・条文本文との整合を検査する（決定的）。

検査（1つでも落ちた肢は公開しない）：
  1. 解説の結論 stated_truth が、公式の○×（truth_at_exam.value）と一致する
  2. 条文の引用 quote が、data/statutes/ に保存した本文（指定した項）の部分文字列である
  3. 本文・結論の「」内（6文字以上）が、引用した条文・肢・問題文のどれかに実在する
  4. 本文で触れた条番号（「5条」「98条の2」など）が、すべて citations に入っている
  5. 判例は名前・裁判所・年月日・判示の要約・確認に使った URL（verified_urls）がそろっている
  6. 正本の肢のうち○×があるものに、すべて解説がある（問単位）
  7. 本文の「判例あり（要確認）」と pending_cases がそろっている（T041）。explain-v3 より前の解説で pending_cases が
     ないものは、確かめ直しが済むまで ⚠（警告。公開は止めない）
  8. verified_urls は courts.go.jp の今開ける URL（T041）

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
PENDING_MARK = "判例あり（要確認）"
CASE_URL_PREFIX = "https://www.courts.go.jp/"
STRICT_CASE_URLS = True  # T041：第三者サイトの判例（民法の42問）と旧形式の URL を直し終えた（2026-10-21）
STRICT_PENDING_FROM = 3   # explain-v3 以降は、要確認と pending_cases の不一致を ❌ にする


def ws(s: str) -> str:
    return re.sub(r"\s+", "", s)


def bad_case_url(u: str) -> bool:
    """確かめに使えない URL：courts.go.jp 以外、または今は開けない旧形式（/app/files/）"""
    return not u.startswith(CASE_URL_PREFIX) or "/app/files/" in u


def prompt_major(doc: dict) -> int:
    m = re.search(r"explain-v(\d+)", doc.get("prompt_version", ""))
    return int(m.group(1)) if m else 0


def case_checks(e: dict, strict_pending: bool) -> tuple[list[str], list[str]]:
    """判例まわりの検査（7・8）。(失敗, 警告) を返す。"""
    fails: list[str] = []
    warns: list[str] = []
    text = e.get("conclusion", "") + e.get("body", "")
    pending = e.get("pending_cases")
    if pending is not None:
        if not isinstance(pending, list) or any(not isinstance(p, dict) or not p.get("about") or not p.get("searched")
                                                for p in pending):
            fails.append("pending_cases の形が不正（about と searched が要る）")
        elif PENDING_MARK in text and not pending:
            fails.append("本文に「判例あり（要確認）」があるのに pending_cases が空")
        elif pending and PENDING_MARK not in text:
            fails.append("pending_cases があるのに本文に「判例あり（要確認）」がない")
    elif PENDING_MARK in text:
        (fails if strict_pending else warns).append("本文に「判例あり（要確認）」があるのに pending_cases がない（T041 で確かめ直す）")
    for case in e.get("cases", []):
        bad = [u for u in case.get("verified_urls", []) if bad_case_url(u)]
        if bad:
            (fails if STRICT_CASE_URLS else warns).append(
                f"判例 {case.get('name', '?')}：courts.go.jp 以外か旧形式の URL で確かめている {bad[:2]}（T041 で確かめ直す）")
    return fails, warns


def check_question(exam: str, year: int, subject: str, number: int,
                   warnings: dict[str, list[str]] | None = None) -> tuple[dict, dict[str, list[str]], list[str]]:
    """(解説ファイル, 肢ID→失敗の一覧, 問単位の失敗) を返す。warnings を渡すと、肢ID→警告の一覧を入れる。"""
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
            # 全角数字の条番号（「３９条」。問題文の文言をそのまま引くと出る）も半角にそろえて照合する
            art = str(int(m.group(1))) + (f"_{int(m.group(2))}" if m.group(2) else "")
            if art not in cited_articles:
                f.append(f"本文で触れた {m.group(0)} が citations にない")

        for case in e.get("cases", []):
            lack = [k for k in ("name", "court", "date", "holding", "verified_urls") if not case.get(k)]
            if lack:
                f.append(f"判例 {case.get('name', '?')}：{lack} がない（確認できない判例は載せない）")

        cf, cw = case_checks(e, strict_pending=prompt_major(doc) >= STRICT_PENDING_FROM)
        f.extend(cf)
        if warnings is not None:
            warnings[sid] = cw

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

    warnings: dict[str, list[str]] = {}
    doc, failures, q_fail = check_question(args.exam, args.year, args.subject, args.number, warnings)
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
        for x in warnings.get(e["target"]["id"], []):
            print(f"    ⚠ {x}")
        bad += bool(f)
    for x in q_fail:
        print(f"❌ {x}")
    sys.exit(1 if bad or q_fail else 0)


if __name__ == "__main__":
    main()
