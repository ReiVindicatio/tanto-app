"""段階2a：問題文のテキストを、問・リード文・前提文・肢・選択肢に構造化する（決定的）。

入力は段階1の data/extracted/…/<科目群>_問題.txt と .meta.json（科目見出しの行範囲）。
AI は使わない。文字の変更は「行の連結（行頭・行末の空白を除いてつなぐ）」と「連続する空白を1つにする」だけ。
各要素に、抽出テキストでの行番号（1始まり）を残す。

使い方：
  python3 pipeline/parse_questions.py R08-2026 刑法刑事訴訟法 刑法
"""
from __future__ import annotations

import argparse
import json
import re
import sys

from common import (EXAM_IDS, EXTRACTED, PAGE_NUMBER_RE, PARSED, ROOT, SUBJECT_IDS, nfkc, to_int, write_json,
                    year_parts)

# 問の見出し。括弧は全角・半角が混ざる年度がある（H24・H28）。配点が次の行に分かれる年度もある（H30 第20問）
QUESTION_RE = re.compile(r"^\s*〔第([0-9０-９]+)問〕\s*[（(]配点[：:]\s*([0-9０-９]+)\s*[）)]\s*$")
QUESTION_ONLY_RE = re.compile(r"^\s*〔第([0-9０-９]+)問〕\s*$")
POINTS_LINE_RE = re.compile(r"^\s*[（(]配点[：:]\s*([0-9０-９]+)\s*[）)]\s*$")
BLOCK_RE = re.compile(r"^\s*【([^】]+)】\s*$")
LABELS_KANA = "アイウエオカキクケコ"
STATEMENT_RE = re.compile(r"^\s+([アイウエオカキクケコ]|[１-９])[．.]")  # 半角の「.」の年度もある（H28）
CHOICE_RE = re.compile(r"^[１-９][．.]")  # 選択肢は行頭（字下げなし）
SUB_RE = re.compile(r"^\s*([⑴-⑼])(?!及び|又は|から|、|，)\s*(.*)$")  # 小問（⑴⑵…）の見出し（H26 問5）。「⑴及び⑵に答えなさい」は除く
SLOT_RE = re.compile(r"\[[,、]?No\.(\d+)\]")  # norm_slots 後の文字列に使う。「［， №38］」と崩れた年度がある（H23 民訴）
RANGE_RE = re.compile(r"([アイウエオカキクケコ])から([アイウエオカキクケコ])の順に\[No\.(\d+)\]から\[No\.(\d+)\]")
TRAILING_SLOT_RE = re.compile(r"\s*［(?:No\.|№)\s*([0-9０-９]+)］\s*$")

CONTEXT_KINDS = {"事例", "会話", "語句群", "見解"}
# 前提文の中で、新しい項目が始まる行
ITEM_START_RE = re.compile(r"^(学生[Ａ-Ｚ]．|[ａ-ｚ]．|[Ⅰ-Ⅹ]．|[Ａ-Ｚ]説：|[①-⑳])")
# 語句群の1行に複数の項目が並んでいるとき（「ｅ．…         ｆ．…」）の区切り
INLINE_ITEMS_RE = re.compile(r"\s{2,}(?=[ａ-ｚ]．)")


def label_id(label: str) -> str:
    if label in LABELS_KANA:
        return "abcdefghij"[LABELS_KANA.index(label)]
    return str(to_int(label))


def squeeze(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def join_lines(lines: list[str]) -> str:
    """折り返された行をつなぐ（日本語なので区切りなし）。"""
    return squeeze("".join(l.strip() for l in lines))


def norm_slots(s: str) -> str:
    """解答欄の表記ゆれ（No.／№、全角数字、折り返し）をそろえた文字列。照合にだけ使い、本文には戻さない。"""
    s = nfkc(s.replace("№", "No."))  # NFKC は № を「No」（ピリオドなし）にするので先に置き換える
    return re.sub(r"\s+", "", s)


def context_text(kind: str, lines: list[str]) -> str:
    """前提文を、項目（話者・語句・段落）ごとに1行にする。"""
    if not lines:
        return ""
    indents = [len(l) - len(l.lstrip()) for l in lines if l.strip()]
    base = min(indents)
    items: list[list[str]] = []
    for l in lines:
        if not l.strip():
            continue
        body = l.strip()
        indent = len(l) - len(l.lstrip())
        new_para = kind == "事例" and indent > base + 2
        if not items or ITEM_START_RE.match(body) or new_para:
            items.append([])
        items[-1].append(body)
    out = []
    for it in items:
        text = "".join(it)
        if kind == "語句群":
            out += [squeeze(p) for p in INLINE_ITEMS_RE.split(text)]
        else:
            out.append(squeeze(text))
    return "\n".join(out)


# 「誤り」の向きの言い方（H30 商法 問25 は「誤ったもの」）
INCORRECT_PAT = r"誤っているもの|誤ったもの|誤りであるもの|正しくないもの"


def first_label(stem_lines: list[tuple[int, str]]) -> str | None:
    """リード文の「アからオまでの各記述」「１から５までの各記述」から、最初の肢ラベルを返す"""
    m = re.search(r"([ア１])から([イウエオカキクケコ２-９])までの各", "".join(l.strip() for _, l in stem_lines))
    return m.group(1) if m else None


def detect_format(stem_n: str, has_choices: bool, blocks: set[str]) -> tuple[str, str | None]:
    """リード文（正規化済み）から形式と、選ぶ対象の向きを決める。決まらなければ unknown／None。"""
    if re.search(r"正しい場合には1を.*誤っている場合には2", stem_n):
        return "true_false_each", None
    if re.search(r"幾つあるか|の個数", stem_n):  # 「幾つかの立場がある」（H30 商法 問30）は個数問題ではない
        fmt = "count"
    elif "語句群" in blocks or re.search(r"[①-⑳]から[①-⑳]までの\(", stem_n):
        return "fill_blank", None
    elif "順不同" in stem_n and re.search(r"\d個選", stem_n):
        fmt = "multi_select_unordered"
    elif ("組合せ" in stem_n or "組み合わせ" in stem_n) and has_choices:
        fmt = "combination"
    elif "どれか" in stem_n and not has_choices:
        fmt = "single_choice"
    else:
        return "unknown", None
    if re.search(INCORRECT_PAT, stem_n):
        pol = "incorrect"
    elif "正しいもの" in stem_n:
        pol = "correct"
    else:
        pol = None
    return fmt, pol


def parse_choices(fmt: str, text: str) -> list[dict]:
    parts = re.split(r"([１-９])．", text)
    choices = []
    for k in range(1, len(parts), 2):
        num, body = to_int(parts[k]), squeeze(parts[k + 1])
        c: dict = {"number": num, "text": body}
        if fmt in ("combination", "single_choice", "multi_select_unordered"):
            c["labels"] = re.findall(r"[アイウエオカキクケコ]", body)
        elif fmt == "fill_blank":
            c["blanks"] = [{"blank": ord(b) - ord("①") + 1, "word": w} for b, w in re.findall(r"([①-⑳])\s*([ａ-ｚ])", body)]
        elif fmt == "count":
            m = re.fullmatch(r"([0-9０-９]+)個", body)
            c["count"] = to_int(m.group(1)) if m else None
        choices.append(c)
    return choices


def parse_question(number: int, points: int, body: list[tuple[int, str]], ids: dict, head_line: int) -> dict:
    """body：問の見出しの次の行から次の問の手前までの (行番号, 行) の並び。head_line：見出しの行番号"""
    stem_lines: list[tuple[int, str]] = []
    blocks: list[dict] = []           # 前提文
    statements: list[dict] = []
    choice_lines: list[tuple[int, str]] = []
    state = "stem"
    cur_block: dict | None = None
    subs: list[dict] = []             # 小問（⑴⑵…）
    flags: list[str] = []

    for ln, line in body:
        if not line.strip():
            continue
        m = BLOCK_RE.match(line)
        if m:
            kind = re.sub(r"\s+", "", m.group(1))
            if kind == "記述":
                state, cur_block = "statements", None
            elif kind in CONTEXT_KINDS:
                cur_block = {"kind": kind, "lines": [], "line_range": [ln, ln]}
                blocks.append(cur_block)
                state = "context"
            else:
                flags.append(f"未知の見出し【{kind}】（{ln}行目）")
                state = "context"
                cur_block = {"kind": kind, "lines": [], "line_range": [ln, ln]}
                blocks.append(cur_block)
            continue
        ms = SUB_RE.match(line)
        if ms and state in ("stem", "statements", "substem"):
            subs.append({"marker": ms.group(1), "lines": [ms.group(2)], "line_range": [ln, ln]})
            state = "substem"
            continue
        if CHOICE_RE.match(line):
            state = "choices"
        elif (state == "context" and cur_block and cur_block["kind"] in ("事例", "見解") and STATEMENT_RE.match(line)
              and STATEMENT_RE.match(line).group(1) == first_label(stem_lines) and not statements):
            # 【記述】の見出しなしで、前提文の直後に肢が続く形（R08 民訴 問31）。
            # リード文が予告する最初の肢ラベル（「１から５までの各記述」なら１）が出たら肢に切り替える
            state = "statements"
            statements.append({"label": STATEMENT_RE.match(line).group(1), "lines": [], "line_range": [ln, ln],
                               "group": None})
        elif state in ("stem", "statements", "substem") and STATEMENT_RE.match(line):
            state = "statements"
            statements.append({"label": STATEMENT_RE.match(line).group(1), "lines": [], "line_range": [ln, ln],
                               "group": len(subs) - 1 if subs else None})

        if state == "stem":
            stem_lines.append((ln, line))
        elif state == "substem":
            subs[-1]["lines"].append(line)
            subs[-1]["line_range"][1] = ln
        elif state == "context":
            cur_block["lines"].append(line)
            cur_block["line_range"][1] = ln
        elif state == "statements":
            if not statements:
                flags.append(f"【記述】の後に肢ラベルのない行（{ln}行目）")
                continue
            statements[-1]["lines"].append(line)
            statements[-1]["line_range"][1] = ln
        elif state == "choices":
            choice_lines.append((ln, line))

    stem = join_lines([l for _, l in stem_lines])
    stem_n = norm_slots(stem)
    block_kinds = {b["kind"] for b in blocks}
    fmt, polarity = detect_format(stem_n, bool(choice_lines), block_kinds)
    sub_questions = []
    for g, sub in enumerate(subs):
        sstem = join_lines(sub["lines"])
        sn = norm_slots(sstem)
        sfmt, spol = detect_format(sn, False, set())
        sub_questions.append({"marker": sub["marker"], "stem": sstem, "format": sfmt, "polarity": spol,
                              "slot_no": [int(n) for n in SLOT_RE.findall(sn)], "line_range": sub["line_range"]})
    if subs:
        fmt, polarity = "compound", None
        if any(sq["format"] != "single_choice" or len(sq["slot_no"]) != 1 for sq in sub_questions):
            flags.append("小問の形式が単一選択でない、または解答欄が1つでない")
    if fmt == "unknown":
        flags.append("形式を判定できない")

    # 解答欄
    slots: list[dict] = []
    m = RANGE_RE.search(stem_n)
    if m:
        a, b = LABELS_KANA.index(m.group(1)), LABELS_KANA.index(m.group(2))
        n0, n1 = int(m.group(3)), int(m.group(4))
        if b - a != n1 - n0:
            flags.append("解答欄の範囲（肢の数と No の数）が合わない")
        for k in range(n1 - n0 + 1):
            slots.append({"no": n0 + k, "statement_label": LABELS_KANA[a + k] if a + k <= b else None})
    elif sub_questions:
        slots = [{"no": n, "sub": g} for g, sq in enumerate(sub_questions) for n in sq["slot_no"]]
    else:
        slots = [{"no": int(n)} for n in SLOT_RE.findall(stem_n)]
    unordered = "順不同" in stem_n

    out_statements = []
    for s in statements:
        text = join_lines(s["lines"])
        text = re.sub(r"^([アイウエオカキクケコ]|[１-９])[．.]", "", text)
        slot_no = None
        mt = TRAILING_SLOT_RE.search(text)
        if mt:
            slot_no = to_int(mt.group(1))
            text = text[:mt.start()]
        group = s["group"]
        sid = label_id(s["label"]) if group is None else f"{group + 1}-{label_id(s['label'])}"
        st = {
            "id": f"{ids['question_id']}-{sid}",
            "label": s["label"],
            "text": text,
            "line_range": s["line_range"],
        }
        if group is not None:
            st["sub"] = group
        if slot_no is not None:
            st["slot_no"] = slot_no
        out_statements.append(st)

    context = [{"kind": b["kind"], "text": context_text(b["kind"], b["lines"]), "line_range": b["line_range"]}
               for b in blocks]
    choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines)) if choice_lines else []
    if fmt == "unknown" and choices and out_statements and "どれか" in stem_n and not re.search(r"組合せ|組み合わせ", stem_n):
        # ア・イ（・ウ）は事例や判決で、それを説明した選択肢から1つ選ぶ形（H23 民訴 問38 など）。
        # 肢ごとの○×は出せないので問題カードにする（derive は導出しない）
        fmt = "meta_choice"
        polarity = "incorrect" if re.search(INCORRECT_PAT, stem_n) else ("correct" if "正しいもの" in stem_n else None)
        choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines))
        flags = [f for f in flags if f != "形式を判定できない"]

    return {
        "id": ids["question_id"],
        "number": number,
        "points": points,
        "format": fmt,
        "polarity": polarity,
        "exhaustive": "全て選んだ" in stem_n,
        "unordered": unordered,
        "stem": stem,
        "context": context,
        "requires_context": bool(block_kinds & {"事例", "会話", "見解"}),
        "statements": out_statements,
        "choices": choices,
        "answer_slots": slots,
        "sub_questions": sub_questions,
        "line_range": [head_line, body[-1][0] if body else head_line],
        "flags": flags,
    }


def parse_section(lines: list[str], start: int, end: int, ids_base: str) -> list[dict]:
    """lines[start:end] のうち、問の見出しごとに切って parse_question に渡す。"""
    numbered = []
    for i in range(start, end):
        line = lines[i].replace("\f", "")
        if PAGE_NUMBER_RE.match(line):
            continue
        numbered.append((i + 1, line))
    # (見出しの位置, 問番号, 配点, 本文の開始位置)
    heads: list[tuple[int, int, int, int]] = []
    for k, (_, l) in enumerate(numbered):
        m = QUESTION_RE.match(l)
        if m:
            heads.append((k, to_int(m.group(1)), to_int(m.group(2)), k + 1))
            continue
        m = QUESTION_ONLY_RE.match(l)
        if m:
            nxt_line = next(((j, x) for j, (_, x) in enumerate(numbered[k + 1:], k + 1) if x.strip()), None)
            mp = POINTS_LINE_RE.match(nxt_line[1]) if nxt_line else None
            if mp:
                heads.append((k, to_int(m.group(1)), to_int(mp.group(1)), nxt_line[0] + 1))
    questions = []
    for j, (k, number, points, body_start) in enumerate(heads):
        nxt = heads[j + 1][0] if j + 1 < len(heads) else len(numbered)
        qid = f"{ids_base}-q{number:02d}"
        questions.append(parse_question(number, points, numbered[body_start:nxt], {"question_id": qid}, numbered[k][0]))
    return questions


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("year", help="例：R08-2026")
    ap.add_argument("group", help="例：刑法刑事訴訟法")
    ap.add_argument("subject", help="例：刑法")
    ap.add_argument("--exam", default="予備試験")
    args = ap.parse_args()

    base = EXTRACTED / args.exam / "短答" / args.year / f"{args.group}_問題"
    meta = json.loads(base.with_suffix(".meta.json").read_text(encoding="utf-8"))
    if meta["status"] != "ok":
        sys.exit(f"🔴 テキスト化の品質が閾値未満（{meta['status']}）：{base}")
    secs = [s for s in meta["sections"] if s["subject"] == args.subject]
    if len(secs) != 1:
        sys.exit(f"🔴 科目見出し［{args.subject}］が {len(secs)} 個")
    sec = secs[0]
    lines = base.with_suffix(".txt").read_text(encoding="utf-8").split("\n")

    era, year = year_parts(args.year)
    exam_id, subj_id = EXAM_IDS[args.exam], SUBJECT_IDS[args.subject]
    questions = parse_section(lines, sec["start_line"] + 1, sec["end_line"], f"{exam_id}-{year}-{subj_id}")

    out = PARSED / exam_id / str(year) / f"{subj_id}.json"
    write_json(out, {
        "source": {"extracted": str(base.with_suffix(".txt").relative_to(ROOT)), **meta["source"]},
        "method": "parse_questions.py（決定的。行の連結と空白の圧縮のみ）",
        "exam": {"type": exam_id, "year": year, "era": era},
        "group": args.group,
        "subject": subj_id,
        "section_line_range": [sec["start_line"] + 1, sec["end_line"]],
        "questions": questions,
    })
    nflags = sum(len(q["flags"]) for q in questions)
    print(f"{'✅' if nflags == 0 else '⚠️'} {out.relative_to(ROOT)}：{len(questions)}問・フラグ {nflags}件")
    for q in questions:
        for f in q["flags"]:
            print(f"  問{q['number']}：{f}")


if __name__ == "__main__":
    main()
