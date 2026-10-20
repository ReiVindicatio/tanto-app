"""解説の生成キュー：次に解説を作る問を、決まった順に出す（T039・決定021）。

対象：肢カード（出題時点の○×があり、人の確認待ちでない肢）のうち、名寄せの代表（app/public/data/index.json の aliases で
他のカードに読み替えられない肢）で、まだ解説ファイルに入っていない肢を持つ問。
- 同じカードの他の出典の肢には、書き出し（export.py）が解説を共有するので作らない
- 民法の改正前の年度（2019年以前）は今は作らない（現行の条文で書くと出題時点の○×と食い違いやすい。T013 で扱いを決める）
- data/review/explain_skips.json に載せた問（検査に通らず飛ばした問など）は出さない
順：予備 → 司法、新しい年度から、科目は決まった順、問番号の順。

使い方：
  python3 pipeline/explain_queue.py            # 残りの数と、次の20問
  python3 pipeline/explain_queue.py --next 9   # 次の9問を「exam year subject number」の形で
  python3 pipeline/explain_queue.py --show yobi 2026 shoho 16   # 解説を書くための1問の中身（書く肢・書かない肢の区別つき）
"""
from __future__ import annotations

import argparse
import json

from common import ROOT

QUESTIONS = ROOT / "data" / "questions"
EXPLANATIONS = ROOT / "data" / "explanations"
INDEX = ROOT / "app" / "public" / "data" / "index.json"
SKIPS = ROOT / "data" / "review" / "explain_skips.json"
SUBJECT_ORDER = ["minpo", "shoho", "minso", "keiho", "keiso", "kenpo", "gyosei"]
EXAM_ORDER = ["yobi", "shiho"]
MINPO_REFORM_YEAR = 2020


def explained_ids() -> set[str]:
    out = set()
    for path in EXPLANATIONS.glob("*/*/*/q*.json"):
        for e in json.loads(path.read_text(encoding="utf-8"))["explanations"]:
            out.add(e["target"]["id"])
    return out


def queue() -> list[tuple[str, int, str, int, int]]:
    aliases = json.loads(INDEX.read_text(encoding="utf-8")).get("aliases", {}) if INDEX.exists() else {}
    flags_path = ROOT / "data" / "review" / "flags.json"
    flagged = {f["statement_id"] for f in json.loads(flags_path.read_text(encoding="utf-8"))["flags"]
               if f["status"] == "open"} if flags_path.exists() else set()
    skips = {s["question_id"] for s in json.loads(SKIPS.read_text(encoding="utf-8"))["skips"]} if SKIPS.exists() else set()
    done = explained_ids()
    out = []
    for path in QUESTIONS.glob("*/*/*.json"):
        doc = json.loads(path.read_text(encoding="utf-8"))
        exam, year, subj = doc["exam"]["type"], doc["exam"]["year"], doc["subject"]
        if subj == "minpo" and year < MINPO_REFORM_YEAR:
            continue
        by_q: dict[str, int] = {}
        for s in doc["statements"]:
            if s["truth_at_exam"] and s["id"] not in flagged and s["id"] not in aliases and s["id"] not in done:
                by_q[s["question_id"]] = by_q.get(s["question_id"], 0) + 1
        for q in doc["questions"]:
            if q["id"] in by_q and q["id"] not in skips:
                out.append((exam, year, subj, q["number"], by_q[q["id"]]))
    out.sort(key=lambda x: (EXAM_ORDER.index(x[0]), -x[1], SUBJECT_ORDER.index(x[2]), x[3]))
    return out


def show(exam: str, year: int, subject: str, number: int) -> None:
    aliases = json.loads(INDEX.read_text(encoding="utf-8")).get("aliases", {}) if INDEX.exists() else {}
    doc = json.loads((QUESTIONS / exam / str(year) / f"{subject}.json").read_text(encoding="utf-8"))
    q = next(x for x in doc["questions"] if x["number"] == number)
    done = explained_ids()
    print(f"# {q['id']}（{q['format']}・配点 {q['points']}）")
    print(f"【リード文】{q['stem']}")
    for c in q["context"]:
        print(f"【前提文：{c['kind']}】\n{c['text']}")
    for k, sq in enumerate(q.get("sub_questions", [])):
        print(f"【小問{sq['marker']}】{sq['stem']}")
    if q["choices"]:
        print("【選択肢】" + " ／ ".join(f"{c['number']}．{c['text']}" for c in q["choices"]))
    print("【肢】")
    for st in doc["statements"]:
        if st["question_id"] != q["id"]:
            continue
        t = st["truth_at_exam"]
        if t is None:
            mark = "書かない（○×なし）"
        elif st["id"] in aliases:
            mark = f"書かない（名寄せ：{aliases[st['id']]} と同じ肢）"
        elif st["id"] in done:
            mark = "書かない（解説あり）"
        else:
            mark = "書く"
        truth = "—" if t is None else ("○" if t["value"] else "×")
        sub = f"小問{q['sub_questions'][st['sub']]['marker']} " if "sub" in st else ""
        print(f"- {st['id']}｜{sub}{st['label']}｜公式 {truth}｜{mark}\n  {st['text']}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--next", type=int, default=None)
    ap.add_argument("--show", nargs=4, metavar=("EXAM", "YEAR", "SUBJECT", "NUMBER"))
    args = ap.parse_args()
    if args.show:
        e, y, sj, n = args.show
        show(e, int(y), sj, int(n))
        return
    q = queue()
    if args.next is not None:
        for exam, year, subj, num, _ in q[:args.next]:
            print(exam, year, subj, num)
        return
    print(f"残り {len(q)}問・肢 {sum(x[4] for x in q)}")
    for exam, year, subj, num, n in q[:20]:
        print(f"  {exam} {year} {subj} q{num:02d}（肢 {n}）")


if __name__ == "__main__":
    main()
