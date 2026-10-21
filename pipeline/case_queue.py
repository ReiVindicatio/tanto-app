"""判例の確かめ直しのキュー：確かめ直しが要る解説の問を、決まった順に出す（T041・決定022）。

対象（順に）：
  ① 判例の verified_urls に courts.go.jp 以外の URL・今は開けない旧形式の URL がある問
  ② 本文に「判例あり（要確認）」があり、pending_cases がまだない問
data/review/recheck_skips.json に載せた問（判決と公式の○×が合わない、など）は出さない。
順は、①→② のそれぞれで、予備 → 司法、新しい年度から、科目は決まった順、問番号の順。

使い方：
  python3 pipeline/case_queue.py              # 残りの数と、次の20問
  python3 pipeline/case_queue.py --next 18    # 次の18問を「exam year subject number」の形で
"""
from __future__ import annotations

import argparse
import json
import re

from check_explanations import EXPLANATIONS, PENDING_MARK, bad_case_url
from common import ROOT
from explain_queue import EXAM_ORDER, SUBJECT_ORDER

SKIPS = ROOT / "data" / "review" / "recheck_skips.json"


def needs(doc: dict) -> tuple[int, int]:
    """(①の肢の数, ②の肢の数)"""
    bad_url = pending = 0
    for e in doc["explanations"]:
        if any(bad_case_url(u) for c in e.get("cases", []) for u in c.get("verified_urls", [])):
            bad_url += 1
        elif PENDING_MARK in e.get("conclusion", "") + e.get("body", "") and "pending_cases" not in e:
            pending += 1
    return bad_url, pending


def queue() -> list[tuple[int, str, int, str, int, int]]:
    """(段階 1|2, exam, year, subject, number, 肢の数) の一覧"""
    skips = {x["question_id"] for x in json.loads(SKIPS.read_text(encoding="utf-8"))["skips"]} if SKIPS.exists() else set()
    out = []
    for path in EXPLANATIONS.glob("*/*/*/q*.json"):
        exam, year, subj = path.parts[-4], int(path.parts[-3]), path.parts[-2]
        number = int(re.sub(r"\D", "", path.stem))
        if f"{exam}-{year}-{subj}-q{number:02d}" in skips:
            continue
        bad_url, pending = needs(json.loads(path.read_text(encoding="utf-8")))
        if bad_url:
            out.append((1, exam, year, subj, number, bad_url + pending))
        elif pending:
            out.append((2, exam, year, subj, number, pending))
    out.sort(key=lambda x: (x[0], EXAM_ORDER.index(x[1]), -x[2], SUBJECT_ORDER.index(x[3]), x[4]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--next", type=int)
    args = ap.parse_args()
    q = queue()
    if args.next:
        for _, exam, year, subj, num, _n in q[:args.next]:
            print(f"{exam} {year} {subj} {num}")
        return
    first = [x for x in q if x[0] == 1]
    print(f"残り {len(q)}問（① 第三者サイトの判例 {len(first)}問・② 要確認 {len(q) - len(first)}問）・肢 {sum(x[5] for x in q)}")
    for stage, exam, year, subj, num, n in q[:20]:
        print(f"  {'①' if stage == 1 else '②'} {exam} {year} {subj} q{num:02d}（肢 {n}）")


if __name__ == "__main__":
    main()
