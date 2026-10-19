"""T009：刑法・刑訴で見つかった問題文の型を、パーサが読めることを確かめる（合成した短い問題文で）。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from parse_questions import parse_question  # noqa: E402


def parse(text: str, number: int = 1, points: int = 2) -> dict:
    body = list(enumerate(text.split("\n"), start=2))
    return parse_question(number, points, body, {"question_id": "yobi-2099-keiso-q01"}, 1)


class ParseQuestionsTest(unittest.TestCase):
    def test_true_false_each_with_mono_phrase(self):
        q = parse("  次のアからイまでの各記述のうち，正しいものには１を，誤っているものには２を選びなさい。\n"
                  " （解答欄は，アからイの順に［№１］から［№２］）\n"
                  "  ア．甲は乙である。［№１］\n"
                  "  イ．丙は丁である。［№２］")
        self.assertEqual(q["format"], "true_false_each")
        self.assertEqual([s["statement_label"] for s in q["answer_slots"]], ["ア", "イ"])
        self.assertEqual(q["flags"], [])

    def test_reference_statute_is_context_not_last_statement(self):
        q = parse("  次の１から２までの各記述のうち，正しいものはどれか。（解答欄は，［№１］）\n"
                  "  １．甲は乙である。\n"
                  "  ２．丙は丁である。\n"
                  "（参照条文）刑事訴訟法\n"
                  "  第１条 この法律は、……。")
        self.assertEqual(q["statements"][-1]["text"], "丙は丁である。")
        self.assertEqual(q["context"][0]["kind"], "参照条文")
        self.assertEqual(q["context"][0]["text"], "刑事訴訟法\n第１条 この法律は、……。")
        self.assertTrue(q["requires_context"])

    def test_inline_statements_are_split(self):
        q = parse("  次のアからウまでのうち、正しいものは幾つあるか。後記１から４までのうちから選びなさい。（解答欄は、［№１］）\n"
                  "  ア．Ⅰ（１）      イ．Ⅰ（２）     ウ．Ⅱ（３）\n"
                  "１．０個  ２．１個  ３．２個  ４．３個")
        self.assertEqual([(s["label"], s["text"]) for s in q["statements"]], [("ア", "Ⅰ（１）"), ("イ", "Ⅰ（２）"), ("ウ", "Ⅱ（３）")])
        self.assertEqual(q["format"], "count")

    def test_statement_without_indent_after_page_break(self):
        q = parse("  次のアからウまでの各記述のうち，正しいものはどれか。（解答欄は，［№１］）\n"
                  "  ア．甲は乙である。\n"
                  "  イ．丙は\n"
                  "丁である。\n"
                  "ウ．戊は己である。")
        self.assertEqual([s["label"] for s in q["statements"]], ["ア", "イ", "ウ"])
        self.assertEqual(q["statements"][1]["text"], "丙は丁である。")

    def test_passage_style_kijutsu_is_context(self):
        q = parse("  次の【記述】中の①から②までの（ ）内から適切な語句を選んだ場合，正しいものの組合せは，後記１から２までのうちどれか。（解答欄は，［№１］）\n"
                  " 【記    述】\n"
                  "  強取とは①（ａ．困難にする・ｂ．抑圧する）に足りる程度の②（ｃ．暴行・ｄ．脅迫）をいう。\n"
                  "１．①ａ ②ｃ\n"
                  "２．①ｂ ②ｄ")
        self.assertEqual(q["format"], "fill_blank")
        self.assertEqual(q["context"][0]["kind"], "記述")
        self.assertEqual(q["statements"], [])

    def test_combination_of_speakers_becomes_question_card(self):
        q = parse("  次の学生ＡないしＣの【発言】のうち，正しいものの組合せは，後記１から２までのうちどれか。（解答欄は，［№１］）\n"
                  " 【発言】\n"
                  "  学生Ａ：甲である。\n"
                  "  学生Ｂ：乙である。\n"
                  "  学生Ｃ：丙である。\n"
                  "１．Ａ Ｂ  ２．Ｂ Ｃ")
        self.assertEqual(q["format"], "meta_choice")
        self.assertEqual(q["context"][0]["text"], "学生Ａ：甲である。\n学生Ｂ：乙である。\n学生Ｃ：丙である。")

    def test_classify_each_extracts_classes_from_stem(self):
        q = parse("  次のアからイまでの各記述を検討し，甲に共同正犯が成立する場合には１を，幇助犯が成立する場合には２を，\n"
                  " 間接正犯が成立する場合には３を選びなさい。（解答欄は，アからイまでの順に［№５］から［№６］）\n"
                  "  ア．甲は乙に頼んだ。（窃盗罪）\n"
                  "  イ．甲は丙を使った。（強盗罪）[№６］")
        self.assertEqual(q["format"], "classify_each")
        self.assertEqual(q["classes"], [{"value": 1, "label": "甲に共同正犯が成立する場合"},
                                        {"value": 2, "label": "幇助犯が成立する場合"},
                                        {"value": 3, "label": "間接正犯が成立する場合"}])
        self.assertEqual([s["statement_label"] for s in q["answer_slots"]], ["ア", "イ"])
        self.assertEqual(q["statements"][1]["slot_no"], 6)  # 半角で始まる「[№６］」も解答欄として読む
        self.assertEqual(q["statements"][1]["text"], "甲は丙を使った。（強盗罪）")

    def test_bracket_heading_inside_statement_when_stem_has_placeholder(self):
        q = parse("  次のアからイまでの各事例を検討し，【   】内の罪数関係にある場合には１を，【 】内の罪数関係にない場合には２を\n"
                  " 選びなさい。（解答欄は，アからイまでの順に［№14］から［№15］）\n"
                  "  ア．公務員が収受した。\n"
                  "            【観念的競合】\n"
                  "                  ［№14］\n"
                  "  イ．自動車を盗み，売却した。【牽連犯】［№15］")
        self.assertEqual([s["label"] for s in q["statements"]], ["ア", "イ"])
        self.assertEqual(q["statements"][0]["text"], "公務員が収受した。【観念的競合】")
        self.assertEqual(q["context"], [])

    def test_embedded_statements_in_passage(self):
        q = parse("  行政指導に関する以下の対話中の次のアからイまでの【      】内の各記述について，それぞれ正しい場合には１を，\n"
                  " 誤っている場合には２を選びなさい。（解答欄は，アからイの順に［№34］から［№35］）\n"
                  "  教員：メリットは何ですか。\n"
                  "  学生：（ア）【行政指導は，任務の範囲を超えて行うことができます。】そのため柔軟です。［№34］\n"
                  "  学生：（イ）【趣旨及び内容を明確に示さなければなりません。】［№35］")
        self.assertEqual(q["format"], "true_false_each")
        self.assertEqual([(s["label"], s["text"], s.get("embedded")) for s in q["statements"]],
                         [("ア", "行政指導は，任務の範囲を超えて行うことができます。", True),
                          ("イ", "趣旨及び内容を明確に示さなければなりません。", True)])
        self.assertEqual(q["context"][0]["kind"], "本文")
        self.assertTrue(q["requires_context"])

    def test_mark_combination_reads_marks_of_each_choice(self):
        # 「〇」（漢数字のゼロ）と「組み合わせ」の表記ゆれも。組合せ（combination）として読むと○×を取り違える（決定016）
        q = parse("  次のアからイまでの各記述について，正しいものには〇，誤っているものには×を付した場合の組み合わせを，\n"
                  " 後記１から４までの中から選びなさい。（解答欄は，［№20］）\n"
                  "  ア．甲である。\n"
                  "  イ．乙である。\n"
                  "１．ア○ イ○ ２．ア〇 イ× ３．ア× イ○ ４．ア× イ×")
        self.assertEqual(q["format"], "mark_combination")
        self.assertEqual(len(q["choices"]), 4)
        self.assertEqual(q["choices"][1]["marks"], [{"label": "ア", "value": True}, {"label": "イ", "value": False}])

    def test_mark_combination_without_statements_is_question_card(self):
        # 下線部が肢の問（下線の範囲がテキストに残らない）は肢がないので問題カード
        q = parse("  次の文章のアからイまでの下線部の各記述について，正しいものに○，誤っているものに×を付した場合の組合せを，\n"
                  " 後記１から４までの中から選びなさい。（解答欄は，［№20］）\n"
                  " 【文章】\n"
                  "  甲は乙である。丙は丁である。\n"
                  "１．ア○ イ○ ２．ア○ イ× ３．ア× イ○ ４．ア× イ×")
        self.assertEqual(q["format"], "meta_choice")

    def test_embedded_statement_with_halfwidth_parens(self):
        q = parse("  次の対話中のアからイまでの【 】内の各記述について，正しいものに○，誤っているものに×を付した場合の組合せを，\n"
                  " 後記１から４までの中から選びなさい。（解答欄は，［№54］）\n"
                  "  学生：（ア）【甲である。】教員：なるほど。\n"
                  "  学生：(イ)【乙である。】\n"
                  "１．ア○ イ○ ２．ア○ イ× ３．ア× イ○ ４．ア× イ×")
        self.assertEqual([(s["label"], s["text"]) for s in q["statements"]], [("ア", "甲である。"), ("イ", "乙である。")])
        self.assertEqual(q["format"], "mark_combination")

    def test_numbered_facts_after_full_stem_are_context_not_sub_questions(self):
        # リード文が解答欄まで言い切った後の⑴⑵は小問でなく事案の箇条（H25 行政法 問20）
        q = parse("  次の事案に関するアからイまでの各記述について，それぞれ正しい場合には１を，誤っている場合には２を\n"
                  " 選びなさい。（解答欄は，アからイの順に［№44］から［№45］）\n"
                  "  ⑴ 教育委員会は通達を発した。\n"
                  "  ⑵ 処分が反復される危険がある。\n"
                  "  ア．甲である。［№44］\n"
                  "  イ．乙である。［№45］")
        self.assertEqual(q["format"], "true_false_each")
        self.assertEqual(q["sub_questions"], [])
        self.assertEqual(q["context"][0]["text"], "⑴ 教育委員会は通達を発した。⑵ 処分が反復される危険がある。")  # 本文は折り返しをつなぐ
        self.assertEqual([s["label"] for s in q["statements"]], ["ア", "イ"])

    def test_all_listed_combination_is_exhaustive(self):
        # 「正しいもの全てを挙げた組合せ」は「全て選んだ」と同じ（司法 H26 憲法 問17）
        q = parse("  次のアからウまでの各記述について，正しいもの全てを挙げた組合せを，後記１から３までの中から選びなさい。（解答欄は，[№31］）\n"
                  "  ア．甲である。\n"
                  "  イ．乙である。\n"
                  "１．ア   ２．イ   ３．アイ")
        self.assertEqual(q["format"], "combination")
        self.assertTrue(q["exhaustive"])


class PageNumberTest(unittest.TestCase):
    def test_doubled_page_number(self):
        from common import PAGE_NUMBER_RE
        self.assertTrue(PAGE_NUMBER_RE.match("                             -- 12 --"))  # 同じ位置に2つ描かれたページ番号（H25）
        self.assertTrue(PAGE_NUMBER_RE.match("   - 1 -"))
        self.assertFalse(PAGE_NUMBER_RE.match("  ア．- 1 - である。"))


if __name__ == "__main__":
    unittest.main()
