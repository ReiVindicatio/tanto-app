"""段階3：問題（2a）と正答（2b）を突き合わせて検証する（決定的）。

1つでも ❌ があれば終了コード 1。結果は reports/validation/<exam>-<year>-<subject>.md に書く。

使い方：
  python3 pipeline/validate.py R08-2026 刑法刑事訴訟法 刑法
"""
from __future__ import annotations

import argparse
import json
import re
import sys

from common import (EXAM_IDS, GROUP_IDS, PAGE_NUMBER_RE, PARSED, REPORTS, ROOT, SUBJECT_IDS, errata_record,
                    manifest_entry, nfkc, sha256, year_parts)

POINTS_PER_SUBJECT = {"yobi": 30, ("shiho", "kenpo"): 50, ("shiho", "minpo"): 75, ("shiho", "keiho"): 50}
KANA = "アイウエオカキクケコ"
DIGITS = "１２３４５６７８９"


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        self.rows.append(("✅" if ok else "❌", name, detail))
        return ok

    @property
    def failed(self) -> int:
        return sum(1 for r in self.rows if r[0] == "❌")


def no_ws(s: str) -> str:
    # NFKC は № を「No」（ピリオドなし）にするので、先に「No.」にそろえる（解答欄の［№15］と再構成の［No.15］）
    return re.sub(r"\s+", "", nfkc(s.replace("№", "No.")))


def rebuild(q: dict) -> str:
    """パース結果から、問の本文を元の順序で組み立て直す（照合用）。"""
    pieces = [(q["line_range"][0], f"〔第{q['number']}問〕(配点:{q['points']})"), (q["line_range"][0] + 0.5, q["stem"])]
    for c in q["context"]:
        if c["kind"] == "参照条文":  # ふつうは問の末尾（選択肢の後ろ）。選択肢より前にある問は choices_line がある
            pieces.append((c["line_range"][0] if ("choices_line" in q or not q["choices"]) else 10 ** 9 + 1, "（参照条文）" + c["text"]))
            continue
        # 【記述】の見出し行・見出しのない本文は、見出しを照合に入れない
        heading = "" if c["kind"] == "記述" or c.get("no_heading") else f"【{c['kind']}】"
        pieces.append((c["line_range"][0], heading + c["text"]))
    for sq in q.get("sub_questions", []):
        pieces.append((sq["line_range"][0], sq["marker"] + sq["stem"]))
    for s in q["statements"]:
        if s.get("embedded"):
            continue  # 本文の中から取り出した肢（文字は本文と重なる）
        tail = f"[No.{s['slot_no']}]" if "slot_no" in s else ""
        pieces.append((s["line_range"][0], f"{s['label']}." + s["text"] + tail))
    if q["choices"]:
        pieces.append((q.get("choices_line", 10 ** 9), "".join(f"{c['number']}." + c["text"] for c in q["choices"])))
    return no_ws("".join(p for _, p in sorted(pieces, key=lambda x: x[0])))


def raw_question_text(lines: list[str], q: dict) -> str:
    a, b = q["line_range"]
    keep = set(q.get("stem_heading_lines", []))  # リード文の一部として残した【…】だけの行（司法 H25 刑事系 問35）
    body = [(ln, l.replace("\f", "")) for ln, l in enumerate(lines[a - 1:b], start=a)]
    # 【記述】の見出し行はパース結果に残さないので、照合からも除く（リード文中の「各【記述】」は残す）
    headings = {"【記述】"} | {f"【{k}】" for k in q.get("statement_headings", [])}
    body = [l for ln, l in body if not PAGE_NUMBER_RE.match(l) and (no_ws(l) not in headings or ln in keep)]
    return no_ws("".join(body))


def first_diff(a: str, b: str) -> str:
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return f"{i}文字目：元「{a[max(0, i - 10):i + 10]}」／再構成「{b[max(0, i - 10):i + 10]}」"
    return f"長さが違う（元 {len(a)}／再構成 {len(b)}）"


def label_sequence_ok(labels: list[str]) -> bool:
    if not labels:
        return True
    seq = KANA if labels[0] in KANA else DIGITS
    return labels == list(seq[:len(labels)])


def validate_question(r: Report, q: dict, a: dict | None, lines: list[str], treated: set[int] = frozenset()) -> None:
    n = q["number"]
    p = f"問{n}"
    fmt = q["format"]
    st_labels = [s["label"] for s in q["statements"]]

    orig, rebuilt = raw_question_text(lines, q), rebuild(q)
    r.check(f"{p} テキストの欠落・重複なし", orig == rebuilt, "" if orig == rebuilt else first_diff(orig, rebuilt))
    r.check(f"{p} パースのフラグなし", not q["flags"], "；".join(q["flags"]))
    r.check(f"{p} 形式を判定できた", fmt != "unknown", fmt)

    texts = [q["stem"]] + [c["text"] for c in q["context"]] + [s["text"] for s in q["statements"]] + [c["text"] for c in q["choices"]]
    leaked = [t for t in texts if "\f" in t or re.search(r"-\s*[0-9０-９]+\s*-", t)]
    r.check(f"{p} ページ番号の混入なし", not leaked, leaked[0][:40] if leaked else "")

    if a is None:
        r.check(f"{p} 正答表にある", False)
        return
    r.check(f"{p} 配点が一致", q["points"] == a["points"], f"問題 {q['points']}／正答 {a['points']}")
    q_nos = [s["no"] for s in q["answer_slots"]]
    a_nos = [s["no"] for s in a["slots"]]
    r.check(f"{p} No の集合が一致", q_nos == a_nos, f"問題 {q_nos}／正答 {a_nos}")
    r.check(f"{p} 順不同の指定が一致", q["unordered"] == a["unordered"], f"問題 {q['unordered']}／正答 {a['unordered']}")
    answers = [s["answer"] for s in a["slots"]]
    if a.get("all_correct_note") and all(x is None for x in answers):
        # 正答表の解答欄が空欄で、全員正答の注記がある（司法 R05 刑法 問6）。errata.json の記録と合うことを確かめて終える
        r.check(f"{p} 解答欄が空欄：全員正答の注記が errata.json の記録と一致", q["number"] in treated, a["all_correct_note"])
        return
    r.check(f"{p} 解答が数値", all(isinstance(x, int) for x in answers), str([s["answer_raw"] for s in a["slots"]]))
    if not all(isinstance(x, int) for x in answers):
        return

    if fmt == "compound":
        groups = [[s["label"] for s in q["statements"] if s.get("sub") == g] for g in range(len(q["sub_questions"]))]
        r.check(f"{p} 小問ごとに肢ラベルが連番", all(gr and label_sequence_ok(gr) for gr in groups), str(groups))
    else:
        r.check(f"{p} 肢ラベルが連番", label_sequence_ok(st_labels), "".join(st_labels))
    if q["choices"]:
        nums = [c["number"] for c in q["choices"]]
        r.check(f"{p} 選択肢が1からの連番", nums == list(range(1, len(nums) + 1)), str(nums))

    if fmt == "combination":
        r.check(f"{p} 組合せ：肢と選択肢がある", bool(st_labels) and bool(q["choices"]))
        bad = [c["number"] for c in q["choices"] if not c["labels"] or not set(c["labels"]) <= set(st_labels)]
        r.check(f"{p} 組合せ：選択肢の肢が実在する", not bad, f"不正な選択肢 {bad}")
        r.check(f"{p} 組合せ：解答が選択肢の範囲", len(answers) == 1 and 1 <= answers[0] <= len(q["choices"]), str(answers))
    elif fmt in ("single_choice", "multi_select_unordered"):
        r.check(f"{p} 肢があり選択肢の行がない", bool(st_labels) and not q["choices"])
        r.check(f"{p} 解答が肢の範囲", all(1 <= x <= len(st_labels) for x in answers), str(answers))
        if fmt == "multi_select_unordered":
            m = re.search(r"(\d+)(?:個|つ)選", nfkc(q["stem"]))
            want = int(m.group(1)) if m else None
            r.check(f"{p} 選ぶ個数と No の数が一致", want == len(answers) and len(answers) >= 2, f"リード文 {want}個／No {len(answers)}個")
            r.check(f"{p} 順不同の解答が重複しない", len(set(answers)) == len(answers), str(answers))
        else:
            r.check(f"{p} 単一選択：No が1つ", len(answers) == 1, str(answers))
    elif fmt == "mark_combination":
        r.check(f"{p} ○×の組合せ：肢と選択肢がある", bool(st_labels) and bool(q["choices"]))
        bad = [c["number"] for c in q["choices"]
               if [m["label"] for m in c["marks"]] != st_labels
               or re.sub(r"\s", "", c["text"]).replace("〇", "○") != "".join(m["label"] + ("○" if m["value"] else "×") for m in c["marks"])]
        r.check(f"{p} ○×の組合せ：選択肢の○×が肢のラベルどおり", not bad, f"不正な選択肢 {bad}／肢 {''.join(st_labels)}")
        combos = [tuple(m["value"] for m in c["marks"]) for c in q["choices"]]
        r.check(f"{p} ○×の組合せ：選択肢が重複しない", len(set(combos)) == len(combos))
        r.check(f"{p} ○×の組合せ：解答が選択肢の範囲", len(answers) == 1 and 1 <= answers[0] <= len(q["choices"]), str(answers))
    elif fmt == "meta_choice":
        r.check(f"{p} 記述を説明した選択肢：肢か前提文と、選択肢がある", (bool(st_labels) or bool(q["context"])) and bool(q["choices"]))
        r.check(f"{p} 記述を説明した選択肢：解答が選択肢の範囲", len(answers) == 1 and 1 <= answers[0] <= len(q["choices"]), str(answers))
    elif fmt == "count":
        r.check(f"{p} 個数：肢と選択肢がある", bool(st_labels) and bool(q["choices"]))
        counts = [c.get("count") for c in q["choices"]]
        r.check(f"{p} 個数：選択肢が個数として読める", all(isinstance(x, int) and 0 <= x <= len(st_labels) for x in counts), str(counts))
        r.check(f"{p} 個数：解答が選択肢の範囲", len(answers) == 1 and 1 <= answers[0] <= len(q["choices"]), str(answers))
    elif fmt == "fill_blank":
        # 語の記号：語句群・語の一覧（【発言】など）の各行の頭、または本文中の「①（ａ．…・ｂ．…）」（H27 刑法 問8）
        # 記号は全角半角をならして比べる（「（i．責任・ｊ．…）」と ｉ だけ半角：司法 R02 刑法 問7）
        words = {nfkc(line[0]) for c in q["context"] if c["kind"] == "語句群" for line in c["text"].split("\n")}
        words |= {m for c in q["context"] for m in re.findall(r"(?:^|\s|\(|・)([a-zアイウエオカキクケコサシスセソ])\.", nfkc(c["text"]))}
        r.check(f"{p} 穴埋め：選ぶ語がある", bool(words))
        m = re.search(r"①から([①-⑳])(?:まで)?の", q["stem"])  # 「①から⑦の（ ）内に」（H23 刑法 問3）
        max_blank = ord(m.group(1)) - ord("①") + 1 if m else None
        bad = [c["number"] for c in q["choices"]
               if not c["blanks"] or any(nfkc(b["word"]) not in words or (max_blank and b["blank"] > max_blank) for b in c["blanks"])]
        r.check(f"{p} 穴埋め：選択肢の空欄と語が実在する", not bad and max_blank is not None, f"不正な選択肢 {bad}／空欄 ①〜{max_blank}")
        r.check(f"{p} 穴埋め：解答が選択肢の範囲", len(answers) == 1 and 1 <= answers[0] <= len(q["choices"]), str(answers))
    elif fmt == "compound":
        groups = [[s for s in q["statements"] if s.get("sub") == g] for g in range(len(q["sub_questions"]))]
        r.check(f"{p} 小問：解答欄が小問ごとに1つ", [s.get("sub") for s in q["answer_slots"]] == list(range(len(groups))))
        r.check(f"{p} 小問：解答が小問の肢の範囲", all(1 <= answers[g] <= len(groups[g]) for g in range(len(groups))) if len(answers) == len(groups) else False, str(answers))
    elif fmt == "classify_each":
        classes = q.get("classes", [])
        values = [c["value"] for c in classes]
        r.check(f"{p} 区分：区分が1からの連番で2つ以上", len(values) >= 2 and values == list(range(1, len(values) + 1)), str(values))
        r.check(f"{p} 区分：区分のラベルが空でない", all(c["label"] for c in classes), str([c["label"] for c in classes]))
        targets = st_labels or [s.get("statement_label") for s in q["answer_slots"]]
        r.check(f"{p} 区分：No の数と肢（空欄）の数が一致", len(q_nos) == len(targets), f"No {len(q_nos)}／肢 {len(targets)}")
        mapping = {s["no"]: s.get("statement_label") for s in q["answer_slots"]}
        bad = [s["label"] for s in q["statements"] if "slot_no" in s and mapping.get(s["slot_no"]) != s["label"]]
        r.check(f"{p} 区分：肢末尾の No とリード文の対応が一致", not bad, f"食い違う肢 {bad}")
        r.check(f"{p} 区分：解答が区分の範囲", all(x in values for x in answers), str(answers))
    elif fmt == "true_false_each":
        if not st_labels and "下線部" in q["stem"]:
            # 下線部が肢の問（下線の範囲はテキストに残らないので肢を取り出さず、問で解くだけにする：T008）
            st_labels = [s.get("statement_label") for s in q["answer_slots"]]
            r.check(f"{p} 各肢○×（下線部）：解答欄に肢のラベルがある", all(st_labels), str(st_labels))
        r.check(f"{p} 各肢○×：No の数と肢の数が一致", len(q_nos) == len(st_labels), f"No {len(q_nos)}／肢 {len(st_labels)}")
        mapping = {s["no"]: s.get("statement_label") for s in q["answer_slots"]}
        bad = [s["label"] for s in q["statements"] if "slot_no" in s and mapping.get(s["slot_no"]) != s["label"]]
        r.check(f"{p} 各肢○×：肢末尾の No とリード文の対応が一致", not bad, f"食い違う肢 {bad}")
        r.check(f"{p} 各肢○×：解答が1か2", all(x in (1, 2) for x in answers), str(answers))

    if a["partial_credit"]:
        r.check(f"{p} 部分点は No が複数の問だけ", len(a_nos) > 1, str(a["partial_credit"]))


def summary_row(q: dict, a: dict | None) -> str:
    ans = "／".join(f"No.{s['no']}={s['answer']}" for s in a["slots"]) if a else "—"
    extra = []
    if q["exhaustive"]:
        extra.append("全て選ぶ")
    if q["unordered"]:
        extra.append("順不同")
    if q["requires_context"]:
        extra.append("前提文：" + "・".join(c["kind"] for c in q["context"]))
    if a and a["partial_credit"]:
        extra.append(f"{a['partial_credit']['correct_needed']}問正解で部分点{a['partial_credit']['points']}点")
    pol = {"incorrect": "誤り", "correct": "正しい", None: "—"}[q["polarity"]]
    labels = "".join(s["label"] for s in q["statements"]) or "—"
    return f"| {q['number']} | {q['points']} | {q['format']} | {pol} | {labels} | {ans} | {'、'.join(extra)} |"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("year")
    ap.add_argument("group")
    ap.add_argument("subject")
    ap.add_argument("--exam", default="予備試験")
    args = ap.parse_args()

    era, year = year_parts(args.year)
    exam_id, subj_id = EXAM_IDS[args.exam], SUBJECT_IDS[args.subject]
    qdoc = json.loads((PARSED / exam_id / str(year) / f"{subj_id}.json").read_text(encoding="utf-8"))
    adoc = json.loads((PARSED / exam_id / str(year) / f"answers-{GROUP_IDS[args.group]}.json").read_text(encoding="utf-8"))
    lines = (ROOT / qdoc["source"]["extracted"]).read_text(encoding="utf-8").split("\n")
    by_num = {a["number"]: a for a in adoc["questions"]}
    qs = qdoc["questions"]

    r = Report()
    nums = [q["number"] for q in qs]
    r.check("問番号が連番", nums == list(range(nums[0], nums[0] + len(nums))) if nums else False, f"{nums[0]}〜{nums[-1]}（{len(nums)}問）" if nums else "問なし")
    nos = [s["no"] for q in qs for s in q["answer_slots"]]
    r.check("No が連番", bool(nos) and nos == list(range(nos[0], nos[0] + len(nos))), f"No.{nos[0]}〜{nos[-1]}" if nos else "")
    want = POINTS_PER_SUBJECT.get(exam_id) or (POINTS_PER_SUBJECT.get((exam_id, subj_id)) if year >= 2015 else None)  # 司法 H23〜H26 は科目系の満点だけ
    q_pts = sum(q["points"] for q in qs)
    a_pts = sum(by_num[n]["points"] for n in nums if n in by_num)
    if want:
        r.check(f"配点の合計が{want}点（問題文）", q_pts == want, str(q_pts))
        r.check(f"配点の合計が{want}点（正答表）", a_pts == want, str(a_pts))
    rec = errata_record(exam_id, year)
    r.check("正誤訂正・採点上の取扱いを確認済み（data/review/errata.json）", bool(rec) and rec.get("status") == "checked",
            (rec or {}).get("checked_at", "記録なし"))
    for label, doc in (("問題", qdoc), ("正答", adoc)):
        src = doc["source"]
        actual = sha256(ROOT / src["path"])
        ok = actual == src["sha256"] == manifest_entry(src["path"])["sha256"]
        r.check(f"{label} PDF の sha256 が manifest・パース時と同じ", ok, actual[:12] + "…")
    treated = {f["number"] for f in (rec or {}).get("findings", [])
               if f.get("subject") == args.subject and f.get("treatment_kind") in ("all_correct", "voided")}
    for q in qs:
        validate_question(r, q, by_num.get(q["number"]), lines, treated)

    out = REPORTS / f"{exam_id}-{year}-{subj_id}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    status = "✅ すべて通過" if r.failed == 0 else f"❌ {r.failed}件の失敗"
    md = [
        f"# 検証：{args.exam} {args.year} {args.subject}",
        "",
        f"- 結果：**{status}**（{len(r.rows)}項目）",
        f"- 問題：`{qdoc['source']['path']}`（sha256 {qdoc['source']['sha256'][:12]}…）",
        f"- 正答：`{adoc['source']['path']}`（sha256 {adoc['source']['sha256'][:12]}…）",
        f"- 生成：`pipeline/validate.py`（このファイルは再実行で上書きされる）",
        "",
        "## 問ごとの要約",
        "",
        "| 問 | 配点 | 形式 | 選ぶ対象 | 肢 | 公式解答 | 備考 |",
        "|---|---|---|---|---|---|---|",
        *[summary_row(q, by_num.get(q["number"])) for q in qs],
        "",
        "## 検査項目",
        "",
        "| | 項目 | 詳細 |",
        "|---|---|---|",
        *[f"| {m} | {name} | {d.replace('|', '｜')} |" for m, name, d in r.rows],
        "",
    ]
    out.write_text("\n".join(md), encoding="utf-8")
    print(f"{'✅' if r.failed == 0 else '❌'} {out.relative_to(ROOT)}：{len(r.rows)}項目中 失敗 {r.failed}")
    for m, name, d in r.rows:
        if m == "❌":
            print(f"  ❌ {name}：{d}")
    sys.exit(1 if r.failed else 0)


if __name__ == "__main__":
    main()
