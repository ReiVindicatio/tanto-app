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
# 「〔第５問 〕 (配 点 ：２)」と空白が混ざる年度がある（H28 憲法）
QUESTION_RE = re.compile(r"^\s*〔\s*第\s*([0-9０-９]+)\s*問\s*〕\s*[（(]\s*配\s*点\s*[：:]\s*([0-9０-９]+)\s*[）)]\s*$")
QUESTION_ONLY_RE = re.compile(r"^\s*〔\s*第\s*([0-9０-９]+)\s*問\s*〕\s*$")
POINTS_LINE_RE = re.compile(r"^\s*[（(]\s*配\s*点\s*[：:]\s*([0-9０-９]+)\s*[）)]\s*$")
BLOCK_RE = re.compile(r"^\s*【([^】]+)】\s*$")
# 問の末尾の「（参照条文）刑事訴訟法」。前提文（kind＝参照条文）として持つ。以前は最後の肢・選択肢にくっついていた
REFERENCE_RE = re.compile(r"^\s*（参照条文）(.*)$")
LABELS_KANA = "アイウエオカキクケコ"
STATEMENT_RE = re.compile(r"^\s+([アイウエオカキクケコ]|[１-９])[．.]")  # 半角の「.」の年度もある（H28）
CHOICE_RE = re.compile(r"^[１-９][．.]")  # 選択肢は行頭（字下げなし）
# 穴埋めの選択肢「１．①ア ②エ …」は字下げされている年度がある（H26 刑法 問3）
# 肢のラベルだけの選択肢「  １．ア        ２．イ」が字下げされている年度がある（H28 行政法 問17）
LABEL_CHOICE_RE = re.compile(r"^\s*[１-９][．.]\s*[アイウエオカキクケコ](?:\s|$)")
BLANK_CHOICE_RE = re.compile(r"^\s*[１-９][．.]\s*[①-⑳]\s*[ａ-ｚアイウエオカキクケコサシスセソ](?:\s|$)")
SUB_RE = re.compile(r"^\s*([⑴-⑼])(?!及び|又は|から|、|，)\s*(.*)$")  # 小問（⑴⑵…）の見出し（H26 問5）。「⑴及び⑵に答えなさい」は除く
SLOT_RE = re.compile(r"\[[,、]?No\.(\d+)\]")  # norm_slots 後の文字列に使う。「［， №38］」と崩れた年度がある（H23 民訴）
RANGE_RE = re.compile(r"([アイウエオカキクケコ])から([アイウエオカキクケコ])(?:まで)?の順に[,，、]?\[No\.(\d+)\]から\[No\.(\d+)\]")  # 「の順に，［№６］から」（司法 H30 刑法 問5）
# 肢ラベルを書かずに「解答欄は，［№25］から［№29］」とだけある年度（R03 刑訴 問19・R06 刑訴 問17）
BARE_RANGE_RE = re.compile(r"解答欄は[,、]\[No\.(\d+)\]から\[No\.(\d+)\]")
# 「①から⑤の順に［№32］から［№36］」（H28 刑訴 問22。NFKC で ① は 1 になる）
ANY_RANGE_RE = re.compile(r"\[No\.(\d+)\]から\[No\.(\d+)\]")
# 本文の中に肢が埋め込まれている形：「次のアからエまでの【 】内の各記述について」（行政法に多い。T008）
EMBED_STEM_RE = re.compile(r"[ア1]から[イウエオカキクケコ2-9]まで(?:の)?【\s*】内の(?:各)?記述")
EMBED_ITEM_RE = re.compile(r"[（(]([アイウエオカキクケコ])[）)]【([^】]*)】")  # 「(ウ)【」（半角。H29 行政法 問23）
# 肢ごとに○×を付けた組合せから選ぶ形：「正しいものに○，誤っているものに×を付した場合の組合せ」（T008）
MARK_COMBINATION_RE = re.compile(r"[○〇].{0,20}×を付した場合の組み?合わ?せ")  # 「〇」（漢数字のゼロ）で書く年度がある
# 対話の話者の行（「  甲    「…」「  教員：…」）
SPEAKER_RE = re.compile(r"^\s{0,3}[^\s「：:（(]{1,8}(?:\s{2,}「|\s*[：:])")
# 区分を選ぶ形式（T033・決定014）：「…場合には１を，…場合には２を（，…場合には３を）選びなさい」
CLASS_MARK_RE = re.compile(r"(?:には|に)([１-９])を")
TRAILING_SLOT_RE = re.compile(r"\s*[［\[](?:No\.|№)\s*([0-9０-９]+)］\s*$")  # 「[№10］」と半角で始まる年度がある（H29 刑法 問9）

CONTEXT_KINDS = {"事例", "会話", "語句群", "見解"}
# 前提文の中で、新しい項目が始まる行
# 話者は「学生Ａ．」のほか「学生Ａ：」「教 授：」の年度がある（R02 刑訴 問23）。【論拠】の「（１）」（R08 刑訴 問25）
ITEM_START_RE = re.compile(r"^([１-９][．.]|学生[Ａ-Ｚ]?[．.：]|教\s*授[Ｘ-Ｚ]?[．.：]|[ａ-ｚ]．|[アイウエオカキクケコサシスセソ]．|[Ⅰ-Ⅹ]．|[Ａ-Ｚ]説：|[①-⑳]|（[１-９]）)")
# 語句群の1行に複数の項目が並んでいるとき（「ｅ．…         ｆ．…」）の区切り
INLINE_ITEMS_RE = re.compile(r"\s{2,}(?=[ａ-ｚアイウエオカキクケコサシスセソ]．)")
WORD_LABELS = "ａ-ｚアイウエオカキクケコサシスセソ"  # 穴埋めの語の記号（R02 刑法 問1 はカタカナ）


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
        new_para = ((kind == "事例" and indent > base + 2) or (kind == "参照条文" and re.match(r"^第[０-９]+条", body))
                    # 【Ｖの証人尋問】などの尋問の記録：話者の行がいちばん浅く、続きの行は深く字下げされている
                    or ("尋問" in kind and indent <= base))
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
    # 「１から５までの甲の罪責」（H27 刑法 問4）も。「アからキまでの【発言】から」（語の一覧）は除く
    m = re.search(r"([ア１])から([イウエオカキクケコ２-９])までの(?!【)", "".join(l.strip() for _, l in stem_lines))
    return m.group(1) if m else None


def split_inline_statements(body: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """1行に並んだ肢「ア．Ⅰ（１）   イ．Ⅰ（２）   ウ．…」（R08 刑訴 問25）を、肢ごとの行に分ける（行番号は同じ）"""
    out = []
    for ln, line in body:
        if STATEMENT_RE.match(line) and re.search(r"\S\s{2,}[アイウエオカキクケコ][．.]", line):
            out += [(ln, part) for part in re.split(r"(?<=\S)\s{2,}(?=[アイウエオカキクケコ][．.])", line)]
        else:
            out.append((ln, line))
    return out


def is_next_label(line: str, prev: str) -> bool:
    """字下げに関係なく、行頭が直前の肢の次のラベル（ア→イ、１→２）か"""
    m = re.match(r"^\s*([アイウエオカキクケコ]|[１-９])[．.]", line)
    if not m:
        return False
    for seq in (LABELS_KANA, "１２３４５６７８９"):
        if prev in seq and seq.index(prev) + 1 < len(seq):
            return m.group(1) == seq[seq.index(prev) + 1]
    return False


def introduces_statements(stem_lines: list[tuple[int, str]], kind: str) -> bool:
    """リード文が「アからオまでの【kind】」「１から５までの各【kind】」と、見出しの下を肢として予告しているか。
    「アからキまでの【発言】から適切な語句を」（H23 刑法 問5）は語の一覧なので除く"""
    stem = re.sub(r"\s+", "", "".join(l for _, l in stem_lines))
    return bool(re.search(r"[ア１]から[イウエオカキクケコ２-９]まで(?:の各|の)【" + re.escape(kind) + r"】(?!から)", stem))


def parse_classes(stem: str) -> list[dict]:
    """リード文から区分の一覧を取り出す。「Ａの場合には１を，Ｂの場合には２を」→ [{1, "Ａの場合"}, {2, "Ｂの場合"}]。
    ラベルは、番号の直前の「，」「、」「。」から後ろの文字列そのまま（文字の変更なし）"""
    parts = CLASS_MARK_RE.split(stem)
    out = []
    for k in range(1, len(parts), 2):
        before = parts[k - 1]
        label = re.split(r"[，、。]", before)[-1].strip()
        out.append({"value": to_int(parts[k]), "label": label})
    return out


def classes_of(stem: str, choices: list[dict], context: list[dict]) -> list[dict]:
    """区分を選ぶ形式の区分：選択肢があればそれ、前提文に「１．…」の一覧（【乙群】など）があればそれ、なければリード文から"""
    if choices:
        return [{"value": c["number"], "label": c["text"]} for c in choices]
    for c in context:
        lines = c["text"].split("\n")
        items = [re.match(r"^([１-９])[．.]\s*(.*)$", l) for l in lines]
        if lines and all(items):
            return [{"value": to_int(m.group(1)), "label": squeeze(m.group(2))} for m in items]
    return parse_classes(stem)


def detect_format(stem_n: str, has_choices: bool, blocks: set[str]) -> tuple[str, str | None]:
    """リード文（正規化済み）から形式と、選ぶ対象の向きを決める。決まらなければ unknown／None。"""
    # 「正しいものには１を，誤っているものには２を」（刑訴に多い）・「正しいものに１を」（R03 刑訴 問19）も同じ形式
    if re.search(r"正しい(?:場合|もの)(?:には|に)1を.*誤っている(?:場合|もの)(?:には|に)2", stem_n):
        return "true_false_each", None
    if not has_choices and "それぞれ" in stem_n and "いずれに当たるか" in stem_n and re.search(r"の順に\[No\.\d+\]から", stem_n):
        # 【甲群】の各肢が【乙群】の１〜５のいずれに当たるか（H27 行政法 問21）。区分＝乙群の各項目
        return "classify_each", None
    if has_choices and "それぞれ" in stem_n and re.search(r"\d+から\d+までの(?:中|うち)から選びなさい", stem_n) \
            and re.search(r"の順に\[No\.\d+\]から", stem_n):
        # 各事例について、それぞれ選択肢（執行停止・仮の義務付け…）から1つ選ぶ（H30 行政法 問22）。区分＝選択肢
        return "classify_each", None
    if has_choices and MARK_COMBINATION_RE.search(stem_n):
        # 肢ごとの○×の組合せから選ぶ形。正解の選択肢の○×がそのまま肢の○×（決定016）
        return "mark_combination", None
    if not has_choices and "選びなさい" in stem_n and len(re.findall(r"(?:には|に)\d+を", stem_n)) >= 2:
        # 肢ごとに区分（１・２・３…）を選ぶ（T033）。○×に読み替えず、問で解くだけで出す（決定014）
        return "classify_each", None
    if re.search(r"幾つあるか|の個数", stem_n):  # 「幾つかの立場がある」（H30 商法 問30）は個数問題ではない
        fmt = "count"
    elif "語句群" in blocks or re.search(r"(?:[①-⑳]|\d+)から(?:[①-⑳]|\d+)までの\(\)内", stem_n):
        # stem_n は NFKC 済みなので ① は 1 になっている
        return "fill_blank", None
    elif "順不同" in stem_n and re.search(r"\d(?:個|つ)選", stem_n):  # 「２つ選びなさい」（H24 刑訴 問26）
        fmt = "multi_select_unordered"
    elif ("組合せ" in stem_n or "組み合わせ" in stem_n) and has_choices:
        fmt = "combination"
    elif "どれか" in stem_n and not has_choices:
        fmt = "single_choice"
    elif re.search(r"各【[^】]+】のうち.*を選びなさい", stem_n) and not has_choices:
        # 「各【発言】のうち、学生Ａの発言であると考えられるものを選びなさい」（R06 刑法 問10）
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
    # 「１．」のほか「１. 」（半角。H23 行政法 問17）。番号は行頭か空白の直後のものだけを区切りとみなす
    parts = re.split(r"(?:(?<=^)|(?<=\s))([１-９])[．.]", text)
    choices = []
    for k in range(1, len(parts), 2):
        num, body = to_int(parts[k]), squeeze(parts[k + 1])
        c: dict = {"number": num, "text": body}
        if fmt in ("combination", "single_choice", "multi_select_unordered"):
            c["labels"] = re.findall(r"[アイウエオカキクケコ]", body)
        elif fmt == "fill_blank":
            c["blanks"] = [{"blank": ord(b) - ord("①") + 1, "word": w}
                           for b, w in re.findall(r"([①-⑳])\s*([" + WORD_LABELS + "])", body)]
        elif fmt == "mark_combination":
            c["marks"] = [{"label": lab, "value": m != "×"} for lab, m in re.findall(r"([アイウエオカキクケコ])\s*([○〇×])", body)]
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
    statement_headings: list[str] = []  # 肢の並びの見出し（【記述】以外。検証で見出し行を照合から除く）

    body = split_inline_statements(body)
    for k, (ln, line) in enumerate(body):
        if not line.strip():
            continue
        mr = REFERENCE_RE.match(line)
        if mr:
            cur_block = {"kind": "参照条文", "lines": [mr.group(1)], "line_range": [ln, ln]}
            blocks.append(cur_block)
            state = "context"
            continue
        m = BLOCK_RE.match(line)
        if m and state == "statements" and statements and re.search(r"【\s*】", "".join(l for _, l in stem_lines)):
            # リード文が「【 】内の罪数関係」のように空欄の【 】を使い、肢の中に【観念的競合】と書く形（H24 刑法 問8）。肢の文の一部
            m = None
        if m:
            kind = re.sub(r"\s+", "", m.group(1))
            nxt = next((l for _, l in body[k + 1:] if l.strip()), "")
            if kind == "記述" and not STATEMENT_RE.match(nxt):
                # 肢の並びではなく、穴埋めの本文としての【記述】（H27 刑法 問8・R02 刑法 問1）。前提文として持つ
                cur_block = {"kind": kind, "lines": [], "line_range": [ln, ln]}
                blocks.append(cur_block)
                state = "context"
            elif kind == "記述":
                state, cur_block = "statements", None
            elif kind not in CONTEXT_KINDS and introduces_statements(stem_lines, kind) and STATEMENT_RE.match(nxt):
                # リード文が「後記アからオまでの【証拠】」のように、この見出しの下を肢として予告している（H28 刑訴 問24）
                state, cur_block = "statements", None
                statement_headings.append(kind)
            else:
                # 【事例】【会話】【語句群】【見解】のほか、【判旨】【罰則】【Ａの証人尋問】なども前提文として持つ（刑法・刑訴）
                cur_block = {"kind": kind, "lines": [], "line_range": [ln, ln]}
                blocks.append(cur_block)
                state = "context"
            continue
        ms = SUB_RE.match(line)
        if ms and state == "stem" and "解答欄" in norm_slots(join_lines([l for _, l in stem_lines])):
            # リード文が解答欄まで言い切った後の⑴⑵は小問でなく、事案の説明の箇条（H25 行政法 問20）。前提文にする
            cur_block = {"kind": "本文", "lines": [line], "line_range": [ln, ln], "no_heading": True}
            blocks.append(cur_block)
            state = "context"
            continue
        if ms and state in ("stem", "statements", "substem"):
            subs.append({"marker": ms.group(1), "lines": [ms.group(2)], "line_range": [ln, ln]})
            state = "substem"
            continue
        if (state == "context" and cur_block is not None and cur_block["kind"] == "参照条文" and line.strip()
                and SPEAKER_RE.match(line)):
            # 参照条文の後ろに続く本文（対話。H23 行政法 問16）。話者の行（「甲    「…」「教員：…」）で参照条文を閉じる
            cur_block = {"kind": "本文", "lines": [], "line_range": [ln, ln], "no_heading": True}
            blocks.append(cur_block)
        if (state == "context" and cur_block is not None and cur_block["kind"] == "参照条文" and statements
                and is_next_label(line, statements[-1]["label"])):
            # 肢の間に挟まった参照条文の後ろで、次の肢が始まる（R04 行政法 問16）
            state = "statements"
        if state == "statements" and statements and is_next_label(line, statements[-1]["label"]):
            # ページ替わりで字下げが消えた肢（H27 刑法 問13 のウ〜オ）・字下げのない１〜５の肢（H28 刑法 問10）
            statements.append({"label": line.strip()[0], "lines": [], "line_range": [ln, ln],
                               "group": len(subs) - 1 if subs else None})
        elif (CHOICE_RE.match(line) or BLANK_CHOICE_RE.match(line)
              or (LABEL_CHOICE_RE.match(line) and statements and statements[-1]["label"] in LABELS_KANA)):
            state = "choices"
        elif (state == "context" and cur_block and cur_block["kind"] != "語句群" and STATEMENT_RE.match(line)
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

    embedded: list[dict] = []
    lead_n = norm_slots(join_lines([l for _, l in stem_lines]))
    if not statements and not blocks and "下線部" in lead_n:
        # 下線部が肢の問（下線の範囲はテキストに残らない）：リード文の後ろの本文を前提文に分けるだけ（肢は取り出さない）
        split = next((k for k in range(len(stem_lines))
                      if "解答欄" in norm_slots(join_lines([l for _, l in stem_lines[:k + 1]]))
                      and stem_lines[k][1].rstrip().endswith("）")), None)
        if split is not None and split + 1 < len(stem_lines):
            passage = stem_lines[split + 1:]
            stem_lines = stem_lines[:split + 1]
            blocks.insert(0, {"kind": "本文", "lines": [l for _, l in passage], "line_range": [passage[0][0], passage[-1][0]],
                              "no_heading": True})
    if not statements and EMBED_STEM_RE.search(lead_n):
        # リード文の後ろの本文（対話・文章）を前提文に分け、その中の「（ア）【…】」を肢として取り出す。
        # 肢の文字は本文と重なるので、検証の照合では肢を数えない（embedded）
        split = next((k for k in range(len(stem_lines))
                      if "解答欄" in norm_slots(join_lines([l for _, l in stem_lines[:k + 1]]))
                      and stem_lines[k][1].rstrip().endswith("）")), None)
        if split is not None and split + 1 < len(stem_lines):
            passage = stem_lines[split + 1:]
            stem_lines = stem_lines[:split + 1]
            blocks.insert(0, {"kind": "本文", "lines": [l for _, l in passage], "line_range": [passage[0][0], passage[-1][0]],
                              "no_heading": True})
        source = "".join(l.strip() for b in blocks for l in b["lines"])
        for m in EMBED_ITEM_RE.finditer(source):
            embedded.append({"label": m.group(1), "lines": [m.group(2)], "line_range": [blocks[0]["line_range"][0]] * 2,
                             "group": None, "embedded": True})
        statements = embedded
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
    elif (BARE_RANGE_RE.search(stem_n) and fmt == "true_false_each") or (fmt == "classify_each" and ANY_RANGE_RE.search(stem_n)):
        mb = BARE_RANGE_RE.search(stem_n) or ANY_RANGE_RE.search(stem_n)
        n0, n1 = int(mb.group(1)), int(mb.group(2))
        labels = [s["label"] for s in statements]
        if not labels and fmt == "classify_each":
            # 肢がなく、本文の①〜⑤の空欄ごとに選ぶ形（H28 刑訴 問22）
            labels = [chr(ord("①") + k) for k in range(n1 - n0 + 1)]
        if n1 - n0 + 1 != len(labels):
            flags.append("解答欄の範囲（肢の数と No の数）が合わない")
        for k in range(n1 - n0 + 1):
            slots.append({"no": n0 + k, "statement_label": labels[k] if k < len(labels) else None})
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
        if s.get("embedded"):
            st["embedded"] = True
        out_statements.append(st)

    context = [{"kind": b["kind"], "text": context_text(b["kind"], b["lines"]), "line_range": b["line_range"],
                **({"no_heading": True} if b.get("no_heading") else {})}
               for b in blocks]
    choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines)) if choice_lines else []
    if (fmt == "unknown" and choices and (out_statements or context) and re.search(r"どれか|選びなさい", stem_n)
            and not re.search(r"組合せ|組み合わせ", stem_n)):
        # ア・イ（・ウ）は事例や判決で、それを説明した選択肢から1つ選ぶ形（H23 民訴 問38 など）。
        # 肢がなく、【会話】の中で条件に合う学生の人数を選ぶ形（H26 刑訴 問22）も同じ扱い。
        # 肢ごとの○×は出せないので問題カードにする（derive は導出しない）
        fmt = "meta_choice"
        polarity = "incorrect" if re.search(INCORRECT_PAT, stem_n) else ("correct" if "正しいもの" in stem_n else None)
        choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines))
        flags = [f for f in flags if f != "形式を判定できない"]

    if fmt == "combination" and choices and out_statements and all(not c.get("labels") for c in choices):
        # 組合せだが、選択肢が肢のラベルでなく別の一覧（【乙群】のＡ〜Ｆなど）の組合せ（H23 行政法 問23）。肢の○×は出せない
        fmt, polarity = "meta_choice", None
        choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines))
    if fmt == "mark_combination" and not out_statements:
        # 肢がテキストに残らない（下線部が肢の問：H23 行政法 問13）。肢の○×は出せないので問題カード
        fmt = "meta_choice"
        choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines))
    if fmt in ("combination", "count") and choices and not out_statements and context:
        # ア〜オの肢がなく、【会話】【発言】の学生と見解の対応・発言者の組合せ・人数などを選ぶ形（R01 刑法 問10・R03 刑訴 問16）。
        # 肢ごとの○×は出せないので問題カードにする
        fmt = "meta_choice"
        choices = parse_choices(fmt, " ".join(l.strip() for _, l in choice_lines))

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
        "requires_context": bool(block_kinds - {"語句群"}),
        "statements": out_statements,
        "choices": choices,
        "answer_slots": slots,
        "sub_questions": sub_questions,
        "line_range": [head_line, body[-1][0] if body else head_line],
        "flags": flags,
        **({"statement_headings": statement_headings} if statement_headings else {}),
        # 参照条文のある問は、検証で元の順に並べるため選択肢の行を残す（参照条文が選択肢の前後どちらにもありうる）
        **({"choices_line": choice_lines[0][0]} if choice_lines and any(b["kind"] == "参照条文" for b in blocks) else {}),
        **({"classes": classes_of(stem, choices, context)} if fmt == "classify_each" else {}),
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
