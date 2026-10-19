"""段階5：肢の○×（出題時点）を公式解答から導出し、正本 data/questions/ を書き出す（決定的）。

前提：段階3の検証（validate.py）が ✅ であること。✅ でなければ書き出さない。
導出規則と basis の意味は 📖 docs/decisions/003-statement-truth-derivation.md

使い方：
  python3 pipeline/derive.py R08-2026 刑法刑事訴訟法 刑法
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

from common import EXAM_IDS, GROUP_IDS, PARSED, ROOT, SUBJECT_IDS, errata_for_question, year_parts

QUESTIONS = ROOT / "data" / "questions"
SITE_URL = "https://www.moj.go.jp/jinji/shihoushiken/"
DERIVABLE = {"combination", "single_choice", "multi_select_unordered", "true_false_each", "compound"}


class DeriveError(Exception):
    pass


def derive_truths(q: dict, answers: list[int]) -> dict[str, dict] | None:
    """肢ID → {value, basis}。導出しない問は None。"""
    if q["format"] not in DERIVABLE:
        return None
    if q["format"] == "compound":
        # 小問ごとに単一選択として導出する
        out = {}
        for g, sq in enumerate(q["sub_questions"]):
            sub_q = {**q, "format": sq["format"], "polarity": sq["polarity"],
                     "statements": [s for s in q["statements"] if s.get("sub") == g]}
            t = derive_truths(sub_q, [answers[g]])
            if t is None:
                return None
            out.update(t)
        return out
    by_label = derive_by_label(q, answers)
    if by_label is None:
        return None
    return {s["id"]: by_label[s["label"]] for s in q["statements"]}


def derive_by_label(q: dict, answers: list[int]) -> dict[str, dict] | None:
    """肢ラベル → {value, basis}（小問のない問）。"""
    fmt, pol = q["format"], q["polarity"]
    labels = [s["label"] for s in q["statements"]]

    if fmt == "true_false_each":
        by_label = {s["statement_label"]: s["no"] for s in q["answer_slots"]}
        ans = dict(zip([s["no"] for s in q["answer_slots"]], answers))
        out = {}
        for lab in labels:
            v = ans[by_label[lab]]
            if v not in (1, 2):
                raise DeriveError(f"問{q['number']}：各肢○×の解答が1・2以外（{v}）")
            out[lab] = {"value": v == 1, "basis": "direct"}
        return out

    if pol is None:
        return None
    side = pol == "correct"  # 選ばれた肢の○×

    if fmt == "combination":
        chosen = q["choices"][answers[0] - 1]["labels"]
        others_basis = {}
        for lab in labels:
            if lab in chosen:
                continue
            if q["exhaustive"]:
                others_basis[lab] = "exhaustive"
            elif any(lab in c["labels"] and c["number"] != answers[0] and set(c["labels"]) - {lab} <= set(chosen)
                     for c in q["choices"]):
                # その肢が polarity 側だと、この選択肢も polarity 側の肢だけになり、正解が2つになる
                others_basis[lab] = "uniqueness"
            else:
                others_basis[lab] = "convention"
        out = {lab: {"value": side, "basis": "selected"} for lab in chosen}
        out.update({lab: {"value": not side, "basis": b} for lab, b in others_basis.items()})
        return out

    # single_choice / multi_select_unordered：肢ラベルは１〜５で、解答の数字が肢の番号
    chosen = {labels[a - 1] for a in answers}
    return {lab: ({"value": side, "basis": "selected"} if lab in chosen else {"value": not side, "basis": "uniqueness"})
            for lab in labels}


def check_consistency(q: dict, truths: dict[str, dict], answers: list[int]) -> None:
    """導出した○×から公式解答が再現できるか（想定外の分布はここで止める）。truths は肢ID → {value, basis}。"""
    n = q["number"]
    fmt, pol = q["format"], q["polarity"]
    if fmt == "true_false_each":
        return
    if fmt == "compound":
        for g, sq in enumerate(q["sub_questions"]):
            side = sq["polarity"] == "correct"
            ids = [s["id"] for s in q["statements"] if s.get("sub") == g]
            hits = [k + 1 for k, sid in enumerate(ids) if truths[sid]["value"] == side]
            if hits != [answers[g]]:
                raise DeriveError(f"問{n} {sq['marker']}：導出した○×で当てはまる肢が {hits}（公式解答 {answers[g]}）")
        return
    label_of = {s["id"]: s["label"] for s in q["statements"]}
    side = pol == "correct"
    p_side = {label_of[sid] for sid, t in truths.items() if t["value"] == side}
    if fmt == "combination":
        matches = [c["number"] for c in q["choices"] if set(c["labels"]) <= p_side]
        if q["exhaustive"]:
            matches = [c["number"] for c in q["choices"] if set(c["labels"]) == p_side]
        if matches != [answers[0]]:
            raise DeriveError(f"問{n}：導出した○×で当てはまる選択肢が {matches}（公式解答 {answers[0]}）")
    else:
        if len(p_side) != len(answers):
            raise DeriveError(f"問{n}：polarity 側の肢が {len(p_side)} 個（解答の数 {len(answers)}）")


def page_of(line: int, page_start_lines: list[int]) -> int:
    """1始まりの行番号 → 1始まりのページ番号。"""
    page = 1
    for i, start in enumerate(page_start_lines):
        if line - 1 >= start:
            page = i + 1
    return page


def build(qdoc: dict, adoc: dict, meta: dict) -> dict:
    subject_name = {v: k for k, v in SUBJECT_IDS.items()}[qdoc["subject"]]
    by_num = {a["number"]: a for a in adoc["questions"]}
    questions, statements = [], []
    for q in qdoc["questions"]:
        a = by_num[q["number"]]
        answers = [s["answer"] for s in a["slots"]]
        errata = errata_for_question(qdoc["exam"]["type"], qdoc["exam"]["year"], subject_name, q["number"])
        all_correct = any(e.get("treatment_kind") == "all_correct" for e in errata)
        voided = any(e.get("treatment_kind") == "voided" for e in errata)
        if any(e.get("treatment_kind") == "multiple_answers" for e in errata):
            raise DeriveError(f"問{q['number']}：複数正解の取扱いは未対応（T006 で対応を決める）")
        # 全員正答・没問の問は、公式の解答による肢の○×を出さない（法務省の採点上の取扱い。CLAUDE.md 禁止事項2の例外）
        truths = None if (all_correct or voided) else derive_truths(q, answers)
        if truths is not None:
            if set(truths) != {s["id"] for s in q["statements"]}:
                raise DeriveError(f"問{q['number']}：○×が決まらない肢がある")
            check_consistency(q, truths, answers)
        flags = list(q["flags"])

        slot_by_no = {s["no"]: s for s in q["answer_slots"]}
        qrec = {
            "id": q["id"],
            "exam": qdoc["exam"],
            "subject": qdoc["subject"],
            "number": q["number"],
            "points": q["points"],
            "format": q["format"],
            "polarity": q["polarity"],
            "exhaustive": q["exhaustive"],
            "unordered": q["unordered"],
            "stem": q["stem"],
            "context": [{"kind": c["kind"], "text": c["text"]} for c in q["context"]],
            "sub_questions": [{"marker": sq["marker"], "stem": sq["stem"], "format": sq["format"],
                               "polarity": sq["polarity"]} for sq in q.get("sub_questions", [])],
            "requires_context": q["requires_context"],
            "choices": q["choices"],
            "answer_slots": [
                {"no": s["no"], "official_answer": s["answer"],
                 **({"statement_label": slot_by_no[s["no"]]["statement_label"]}
                    if slot_by_no[s["no"]].get("statement_label") else {}),
                 **({"sub": slot_by_no[s["no"]]["sub"]} if "sub" in slot_by_no[s["no"]] else {})}
                for s in a["slots"]
            ],
            "scoring": {"partial_credit": a["partial_credit"], "no_partial_credit": a["no_partial_credit"],
                        "raw_note": a["remarks_raw"]},
            "status": {"voided": voided, "all_correct": all_correct,
                       "errata": [{k: e[k] for k in ("content", "treatment", "source_url") if k in e} for e in errata]},
            "statements": [s["id"] for s in q["statements"]],
            "statement_truth_derivable": truths is not None,
            "provenance": {
                "question_pdf": qdoc["source"]["path"],
                "answer_pdf": adoc["source"]["path"],
                "page": page_of(q["line_range"][0], meta["page_start_lines"]),
                "line_range": q["line_range"],
                "extraction": "pdftotext",
            },
            "flags": flags,
        }
        questions.append(qrec)

        for s in q["statements"]:
            t = truths[s["id"]] if truths else None
            truth = None
            if t:
                if q["format"] == "true_false_each":
                    used = [x for x in a["slots"] if x["no"] == s.get("slot_no")]
                elif q["format"] == "compound":
                    used = [x for x in a["slots"] if slot_by_no[x["no"]].get("sub") == s.get("sub")]
                else:
                    used = a["slots"]
                truth = {"value": t["value"], "derivation": q["format"], "basis": t["basis"],
                         "derived_from": {"slots": [{"no": x["no"], "official_answer": x["answer"]} for x in used]}}
            statements.append({
                "id": s["id"],
                "question_id": q["id"],
                "label": s["label"],
                "text": s["text"],
                "requires_context": q["requires_context"] or "sub" in s,
                **({"sub": s["sub"]} if "sub" in s else {}),
                "truth_at_exam": truth,
                "truth_current": {"status": "unreviewed", "value": None, "basis": None, "law_change_refs": [],
                                  "reviewed_by": None, "reviewed_at": None},
                "tags": {"articles": [], "topics": []},
                "provenance": {"line_range": s["line_range"]},
            })

    urls = sorted({u for u in (qdoc["source"].get("source_url"), adoc["source"].get("source_url")) if u})
    return {
        "schema_version": 1,
        "attribution": {
            "text": f"出典：法務省ウェブサイト（{SITE_URL}）",
            "source_pdfs": urls,
            "note": "法務省が公開する試験問題・正解の PDF から、このプロジェクトがテキストを抽出し、構造化・編集・加工したもの。法務省が作成したものではない。肢ごとの○×は公式の解答から導出したもの。",
        },
        "exam": qdoc["exam"],
        "subject": qdoc["subject"],
        "generated_by": "pipeline/derive.py",
        "questions": questions,
        "statements": statements,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("year")
    ap.add_argument("group")
    ap.add_argument("subject")
    ap.add_argument("--exam", default="予備試験")
    args = ap.parse_args()

    v = subprocess.run([sys.executable, str(ROOT / "pipeline" / "validate.py"), args.year, args.group, args.subject,
                        "--exam", args.exam], capture_output=True, text=True)
    if v.returncode != 0:
        sys.exit(f"🔴 段階3の検証が ✅ でないので書き出さない\n{v.stdout}{v.stderr}")

    era, year = year_parts(args.year)
    exam_id, subj_id = EXAM_IDS[args.exam], SUBJECT_IDS[args.subject]
    qdoc = json.loads((PARSED / exam_id / str(year) / f"{subj_id}.json").read_text(encoding="utf-8"))
    adoc = json.loads((PARSED / exam_id / str(year) / f"answers-{GROUP_IDS[args.group]}.json").read_text(encoding="utf-8"))
    meta = json.loads((ROOT / qdoc["source"]["extracted"]).with_suffix(".meta.json").read_text(encoding="utf-8"))
    try:
        doc = build(qdoc, adoc, meta)
    except DeriveError as e:
        sys.exit(f"🔴 導出で停止：{e}")

    out = QUESTIONS / exam_id / str(year) / f"{subj_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    sts = doc["statements"]
    derived = [s for s in sts if s["truth_at_exam"]]
    counts: dict[str, int] = {}
    for s in derived:
        counts[s["truth_at_exam"]["basis"]] = counts.get(s["truth_at_exam"]["basis"], 0) + 1
    cards = sum(1 for q in doc["questions"] if not q["statement_truth_derivable"])
    print(f"✅ {out.relative_to(ROOT)}：{len(doc['questions'])}問・肢 {len(sts)}（○×あり {len(derived)}：{counts}）・問題カード {cards}問")


if __name__ == "__main__":
    main()
