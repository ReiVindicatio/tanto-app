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


class DeriveMatchingCombinationTest(unittest.TestCase):
    """T048：【記述】と【結論】を対応させる問（選択肢「アⅠ－イⅡ」）は肢の○×を導かない"""

    def combination(self, texts: list[str]) -> dict:
        return {
            "number": 16, "format": "combination", "polarity": "correct", "exhaustive": False,
            "statements": [{"id": f"q-{x}", "label": l} for x, l in zip("abc", "アイウ")],
            "choices": [{"number": k + 1, "text": t, "labels": [c for c in t if c in "アイウ"]}
                        for k, t in enumerate(texts)],
        }

    def test_matching_choices_are_not_derived(self):
        self.assertIsNone(derive_truths(self.combination(["アⅠ－イⅡ", "アⅡ－ウⅢ", "イⅢ－ウⅢ"]), [3]))

    def test_plain_combination_is_still_derived(self):
        t = derive_truths(self.combination(["ア イ", "ア ウ", "イ ウ"]), [3])
        self.assertEqual({k: v["value"] for k, v in t.items()}, {"q-a": False, "q-b": True, "q-c": True})


if __name__ == "__main__":
    unittest.main()
