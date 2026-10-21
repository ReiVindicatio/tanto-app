"""T042：名寄せ（決定018）。前提文つきの肢は、解答欄の番号が違っても同じ肢としてまとめる。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from export import dedup  # noqa: E402

STEM = "次の【事例】に関する後記アからオまでの各【記述】を判例の立場に従って検討し、正しい場合には１を、誤っている場合には２を選びなさい。"


def doc(exam: str, year: int, slots: str, stem_extra: str = "", truth: bool = False) -> dict:
    qid = f"{exam}-{year}-keiho-q01"
    return {
        "exam": {"type": exam, "year": year, "era": "R05"}, "subject": "keiho",
        "questions": [{"id": qid, "number": 1, "stem": STEM + stem_extra + slots,
                       "context": [{"text": "【事例】甲は、Ａの財布を盗んだ。"}]}],
        "statements": [{"id": f"{qid}-a", "question_id": qid, "label": "ア", "text": "甲には窃盗罪が成立しない。",
                        "requires_context": True, "truth_at_exam": {"value": truth}}],
    }


class DedupTest(unittest.TestCase):
    def test_answer_slot_numbers_are_ignored(self):
        y = doc("yobi", 2023, "（解答欄は、アからオの順に［№15］から［№19］）")
        s = doc("shiho", 2023, "（解答欄は、アからオの順に［No.32］から［No.36］）")
        aliases, conflicts = dedup([y, s])
        self.assertEqual(aliases, {"shiho-2023-keiho-q01-a": "yobi-2023-keiho-q01-a"})
        self.assertEqual(conflicts, [])

    def test_slot_mark_in_statement_text_is_ignored(self):
        y = doc("yobi", 2016, "（解答欄は、［№５］）")
        s = doc("shiho", 2016, "（解答欄は、［№11］）")
        y["statements"][0]["text"] += "[№５]"
        s["statements"][0]["text"] += "[№11]"
        aliases, _ = dedup([y, s])
        self.assertEqual(aliases, {"shiho-2016-keiho-q01-a": "yobi-2016-keiho-q01-a"})

    def test_different_lead_text_is_not_merged(self):
        y = doc("yobi", 2023, "（解答欄は、［№15］）")
        s = doc("shiho", 2023, "（解答欄は、［No.32］）", stem_extra="ただし、見解Ｂに立つものとする。")
        aliases, _ = dedup([y, s])
        self.assertEqual(aliases, {})

    def test_different_truth_is_not_merged(self):
        y = doc("yobi", 2023, "（解答欄は、［№15］）", truth=False)
        s = doc("shiho", 2023, "（解答欄は、［No.32］）", truth=True)
        aliases, conflicts = dedup([y, s])
        self.assertEqual(aliases, {})
        self.assertEqual(len(conflicts), 1)


if __name__ == "__main__":
    unittest.main()
