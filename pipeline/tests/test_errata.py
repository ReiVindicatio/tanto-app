"""T006：法務省の採点上の取扱い（全員正答）が正本に反映されることを確かめる。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import derive  # noqa: E402
from common import PARSED, ROOT  # noqa: E402


def load(year: int, subject: str):
    qdoc = json.loads((PARSED / "yobi" / str(year) / f"{subject}.json").read_text(encoding="utf-8"))
    adoc = json.loads((PARSED / "yobi" / str(year) / "answers-minji.json").read_text(encoding="utf-8"))
    meta = json.loads((ROOT / qdoc["source"]["extracted"]).with_suffix(".meta.json").read_text(encoding="utf-8"))
    return qdoc, adoc, meta


class ErrataTest(unittest.TestCase):
    def test_all_correct_question_has_no_statement_truths(self):
        qdoc, adoc, meta = load(2026, "minpo")
        finding = {"subject": "民法", "number": 1, "treatment_kind": "all_correct",
                   "content": "（テスト用）", "treatment": "全員正答として扱う", "source_url": "https://www.moj.go.jp/"}

        def fake(exam_id, year, subject_name, number):
            return [finding] if (subject_name, number) == ("民法", 1) else []

        with mock.patch.object(derive, "errata_for_question", side_effect=fake):
            doc = derive.build(qdoc, adoc, meta)
        q1 = next(q for q in doc["questions"] if q["number"] == 1)
        self.assertTrue(q1["status"]["all_correct"])
        self.assertFalse(q1["statement_truth_derivable"])
        self.assertEqual(q1["status"]["errata"][0]["treatment"], "全員正答として扱う")
        st = [s for s in doc["statements"] if s["question_id"] == q1["id"]]
        self.assertTrue(all(s["truth_at_exam"] is None for s in st))
        q2 = next(q for q in doc["questions"] if q["number"] == 2)
        self.assertFalse(q2["status"]["all_correct"])
        self.assertTrue(q2["statement_truth_derivable"])

    def test_multiple_answers_is_not_silently_accepted(self):
        qdoc, adoc, meta = load(2026, "minpo")
        with mock.patch.object(derive, "errata_for_question",
                               side_effect=lambda *a: [{"treatment_kind": "multiple_answers"}] if a[3] == 3 else []):
            with self.assertRaises(derive.DeriveError):
                derive.build(qdoc, adoc, meta)


if __name__ == "__main__":
    unittest.main()
