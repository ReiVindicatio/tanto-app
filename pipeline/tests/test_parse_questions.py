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


if __name__ == "__main__":
    unittest.main()
