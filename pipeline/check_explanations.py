"""段階6のゲート：解説と公式の○×・条文本文との整合を検査する（決定的）。

検査（1つでも落ちた肢は公開しない）：
  1. 解説の結論 stated_truth が、公式の○×（truth_at_exam.value）と一致する
  2. 条文の引用 quote が、data/statutes/ に保存した本文（指定した項）の部分文字列である
  3. 本文・結論の「」内（6文字以上）が、引用した条文・肢・問題文のどれかに実在する
  4. 本文で触れた条番号（「5条」「98条の2」など。「」の外の「第四十一条」のような漢数字も）が、すべて citations に入っている
  5. 判例は名前・裁判所・年月日・判示の要約・確認に使った URL（verified_urls）がそろっている
  6. 正本の肢のうち○×があるものに、すべて解説がある（問単位）
  7. 本文の「判例あり（要確認）」と pending_cases がそろっている（T041）。explain-v3 より前の解説で pending_cases が
     ないものは、確かめ直しが済むまで ⚠（警告。公開は止めない）
  8. verified_urls は courts.go.jp の今開ける URL（T041）
  9. 問の解説（question_explanation。T018：肢ごとの○×が決まらない問）は、stated_answer が公式の正解（解答欄の順）と一致し、
     2〜5・7・8 も肢の解説と同じに通る

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
KANJI_NUM = "〇一二三四五六七八九十百千"
# 漢数字の条番号（T048）。「第」のない「一条項」「前二条」は拾わない
KANJI_ARTICLE_RE = re.compile(rf"第([{KANJI_NUM}]+)条(?:の([{KANJI_NUM}]+))?")
PENDING_MARK = "判例あり（要確認）"
CASE_URL_PREFIX = "https://www.courts.go.jp/"
STRICT_CASE_URLS = True  # T041：第三者サイトの判例（民法の42問）と旧形式の URL を直し終えた（2026-10-21）
STRICT_PENDING_FROM = 1   # 要確認と pending_cases の不一致を ❌ にする（v3 以降だけだったのを、T041 で古い解説を直し終えたので全部に。2026-10-21）


def ws(s: str) -> str:
    return re.sub(r"\s+", "", s)


def kanji_to_int(s: str) -> int:
    """「四百二十三」→ 423"""
    total, cur = 0, 0
    for ch in s:
        if ch in "十百千":
            total += (cur or 1) * {"十": 10, "百": 100, "千": 1000}[ch]
            cur = 0
        else:
            cur = KANJI_NUM.index(ch)
    return total + cur


def strip_quotes(s: str) -> str:
    """「」の中を消す（入れ子の「」も外側まで）"""
    while True:
        t = QUOTE_RE.sub("", s)
        if t == s:
            return t
        s = t


def article_numbers(text: str) -> set[str]:
    """文中の条番号（算用数字・全角数字・漢数字）を「41」「98_2」の形で集める"""
    out = {str(int(m.group(1))) + (f"_{int(m.group(2))}" if m.group(2) else "") for m in ARTICLE_REF_RE.finditer(text)}
    out |= {str(kanji_to_int(m.group(1))) + (f"_{kanji_to_int(m.group(2))}" if m.group(2) else "")
            for m in KANJI_ARTICLE_RE.finditer(text)}
    return out


def first_mismatch(quote: str, scope: str) -> str:
    """引用が本文と食い違う位置の手がかり（T048）：本文のどこかと一致する最長の先頭部分の次の文字を示す"""
    q, s = ws(quote), ws(scope)
    n = 0
    while n < len(q) and q[:n + 1] in s:
        n += 1
    if n == len(q):
        return ""
    at = s.find(q[:n]) + n if n else 0
    want = s[at:at + 3] if n else ""
    return f"（{n + 1}文字目から食い違う：引用「{q[max(0, n - 5):n + 3]}」／本文「{s[max(0, at - 5):at]}{want}」）"


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


def check_content(e: dict, own_text: str, question_text: str, strict_pending: bool) -> tuple[list[str], list[str]]:
    """肢の解説・問の解説に共通の検査（2〜5・7・8）。own_text は肢の文（問の解説なら肢・選択肢・小問の文の全部）。
    引用の取得情報（text_sha256・fetched_at・source_url）を e の citations に書き足す。(失敗, 警告) を返す"""
    f: list[str] = []
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
            f.append(f"{c['law']} {st['title']}：引用が保存した本文と一致しない「{c['quote'][:30]}…」"
                     + first_mismatch(c["quote"], scope))
        cited_texts.append(st["text"])
        cited_articles.add(c["article"])
        c["text_sha256"] = st["text_sha256"]
        c["fetched_at"] = st["fetched_at"]
        c["source_url"] = st["url"]

    haystack = ws("".join(cited_texts) + own_text + question_text)
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
    # 漢数字の条番号（T048）：「」の中は検査3で見ているので外す。問題文・肢にある番号（参照条文）は通す
    in_question = article_numbers(question_text + own_text)
    for m in KANJI_ARTICLE_RE.finditer(strip_quotes(e.get("body", ""))):
        art = str(kanji_to_int(m.group(1))) + (f"_{kanji_to_int(m.group(2))}" if m.group(2) else "")
        if art not in cited_articles and art not in in_question:
            f.append(f"本文で触れた {m.group(0)} が citations にない")

    for case in e.get("cases", []):
        lack = [k for k in ("name", "court", "date", "holding", "verified_urls") if not case.get(k)]
        if lack:
            f.append(f"判例 {case.get('name', '?')}：{lack} がない（確認できない判例は載せない）")

    cf, cw = case_checks(e, strict_pending=strict_pending)
    f.extend(cf)

    return f, cw


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

        cf, cw = check_content(e, s["text"], question_text, strict_pending=prompt_major(doc) >= STRICT_PENDING_FROM)
        f.extend(cf)
        if warnings is not None:
            warnings[sid] = cw

    # 問の解説（T018）：肢ごとの○×が決まらない問（穴埋め・個数・区分など）に、問ごとに1つ
    qe = doc.get("question_explanation")
    if qe is not None:
        f = []
        failures[q["id"]] = f
        official = [slot.get("official_answer") for slot in q["answer_slots"]]
        if q["status"]["voided"] or q["status"]["all_correct"] or None in official:
            f.append("公式の正解がない問（没問・全員正解）には問の解説を書かない")
        elif (sorted if q.get("unordered") else list)(qe.get("stated_answer") or []) != (sorted if q.get("unordered") else list)(official):
            f.append(f"🔴 公式の正解と食い違う（公式 {official}／解説 {qe.get('stated_answer')}）")
        own = "".join(x["text"] for x in sts.values()) + "".join(c.get("text", "") for c in q["choices"]) \
            + "".join(sq.get("stem", "") for sq in q.get("sub_questions", []))
        cf, cw = check_content(qe, own, question_text, strict_pending=True)
        f.extend(cf)
        if warnings is not None:
            warnings[q["id"]] = cw

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
    qe = doc.get("question_explanation")
    if qe is not None:
        qf = failures[doc["question_id"]]
        qe["status"] = "published" if not qf else "flagged"
        qe["check"] = {"passed": not qf, "failures": qf}
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
    if qe is not None:
        f = failures[doc["question_id"]]
        print(f"{'✅' if not f else '❌'} {doc['question_id']}（問の解説）")
        for x in f:
            print(f"    {x}")
        for x in warnings.get(doc["question_id"], []):
            print(f"    ⚠ {x}")
        bad += bool(f)
    for x in q_fail:
        print(f"❌ {x}")
    sys.exit(1 if bad or q_fail else 0)


if __name__ == "__main__":
    main()
