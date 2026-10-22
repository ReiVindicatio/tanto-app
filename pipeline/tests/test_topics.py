"""T016：肢の分野（解説が最初に引いている条文の、目次の編・章）。作り物の目次で確かめる。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from topics import OTHER, OUTSIDE, Tocs, heading, topic_of  # noqa: E402

TOCS = {
    "民法": {"1": ["第一編　総則", "第一章　通則"], "3": ["第一編　総則", "第二章　人", "第一節　権利能力"],
             "94": ["第一編　総則", "第五章　法律行為", "第二節　意思表示"]},
    "日本国憲法": {"前文": ["前文"], "21": ["第三章　国民の権利及び義務"]},
    "会社法": {"295": ["第二編　株式会社", "第四章　機関", "第一節　株主総会及び種類株主総会"]},
}


def exp(*cites):
    return {"citations": [{"type": "statute", "law": law, "article": art} for law, art in cites]}


class TopicTest(unittest.TestCase):
    def setUp(self):
        self.tocs = Tocs(lambda law: TOCS.get(law))

    def test_heading_stops_at_chapter(self):
        self.assertEqual(heading(["第一編　総則", "第五章　法律行為", "第二節　意思表示"]), ["第一編 総則", "第五章 法律行為"])

    def test_first_citation_of_subject_law_decides(self):
        label, _ = topic_of("minpo", exp(("借地借家法", "10"), ("民法", "94"), ("民法", "3")), self.tocs)
        self.assertEqual(label, "第一編 総則 › 第五章 法律行為")

    def test_order_follows_table_of_contents(self):
        _, k3 = topic_of("minpo", exp(("民法", "3")), self.tocs)
        _, k94 = topic_of("minpo", exp(("民法", "94")), self.tocs)
        self.assertLess(k3, k94)

    def test_preamble_supplementary_and_no_citation(self):
        self.assertEqual(topic_of("kenpo", exp(("日本国憲法", "前文")), self.tocs)[0], "前文")
        self.assertEqual(topic_of("minpo", exp(("民法", "附則1")), self.tocs)[0], OUTSIDE)
        self.assertEqual(topic_of("minpo", exp(), self.tocs)[0], OTHER)
        self.assertEqual(topic_of("minpo", None, self.tocs)[0], OTHER)

    def test_commercial_law_has_law_prefix_and_admin_law_is_per_law(self):
        self.assertEqual(topic_of("shoho", exp(("会社法", "295")), self.tocs)[0], "会社法 第二編 株式会社 › 第四章 機関")
        self.assertEqual(topic_of("gyosei", exp(("行政手続法", "14")), self.tocs)[0], "行政手続法")


if __name__ == "__main__":
    unittest.main()
