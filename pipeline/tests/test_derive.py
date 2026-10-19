"""T035：○×の組合せ（mark_combination）の導出と矛盾検査（決定016）。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from derive import DeriveError, check_consistency, derive_truths  # noqa: E402

MARKS = [(True, True), (True, False), (False, True), (False, False)]


def question() -> dict:
    return {
        "number": 1, "format": "mark_combination", "polarity": None, "exhaustive": False,
        "statements": [{"id": "q-a", "label": "ア"}, {"id": "q-b", "label": "イ"}],
        "choices": [{"number": k + 1, "marks": [{"label": "ア", "value": a}, {"label": "イ", "value": b}]}
                    for k, (a, b) in enumerate(MARKS)],
    }


class DeriveMarkCombinationTest(unittest.TestCase):
    def test_truths_are_marks_of_official_choice(self):
        q = question()
        t = derive_truths(q, [3])
        self.assertEqual(t, {"q-a": {"value": False, "basis": "direct"}, "q-b": {"value": True, "basis": "direct"}})
        check_consistency(q, t, [3])

    def test_duplicate_choice_is_stopped(self):
        q = question()
        q["choices"][3]["marks"] = q["choices"][2]["marks"]  # 選択肢3と4が同じ○×
        with self.assertRaises(DeriveError):
            check_consistency(q, derive_truths(q, [3]), [3])


if __name__ == "__main__":
    unittest.main()
