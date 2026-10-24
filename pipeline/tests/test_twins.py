"""T050：よく似た肢（文がよく似ているのに○×が逆の組）の選び方と、違う部分の範囲。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from twins import comparable, diff_ranges, display_text, find_pairs  # noqa: E402


def card(id, text, truth, subject="keiho"):
    return {"id": id, "subject": subject, "text": text, "truth": truth}


class FindPairsTest(unittest.TestCase):
    def test_one_word_difference_with_opposite_truth(self):
        pairs = find_pairs([
            card("x-q01-4", "刑法各則に規定された行為の主体には，法人は含まれない。", True),
            card("x-q01-5", "刑法各則に規定された行為の客体には，法人は含まれない。", False),
        ])
        self.assertEqual(len(pairs), 1)
        p = pairs[0]
        self.assertEqual((p["a"], p["b"]), ("x-q01-4", "x-q01-5"))  # a が○、b が×
        self.assertEqual(p["ad"], [[13, 15]])  # 「主」ではなく「主体」
        self.assertEqual(p["bd"], [[13, 15]])  # 「客体」

    def test_same_truth_is_not_a_pair(self):
        self.assertEqual(find_pairs([
            card("a", "刑法各則に規定された行為の主体には，法人は含まれない。", True),
            card("b", "刑法各則に規定された行為の客体には，法人は含まれない。", True),
        ]), [])

    def test_different_subjects_are_not_paired(self):
        self.assertEqual(find_pairs([
            card("a", "刑法各則に規定された行為の主体には，法人は含まれない。", True, "keiho"),
            card("b", "刑法各則に規定された行為の客体には，法人は含まれない。", False, "keiso"),
        ]), [])

    def test_dissimilar_texts_are_not_paired(self):
        self.assertEqual(find_pairs([
            card("a", "刑法各則に規定された行為の主体には，法人は含まれない。", True),
            card("b", "告訴は，代理人によってもすることができる。", False),
        ]), [])

    def test_punctuation_width_does_not_count_as_difference(self):
        # 年度によって読点が「，」と「、」で違う。比べるときはならし、違う部分にも数えない
        pairs = find_pairs([
            card("a", "不能の解除条件が付された法律行為は，無条件となる。", True, "minpo"),
            card("b", "不能の解除条件が付された法律行為は、無効となる。", False, "minpo"),
        ])
        self.assertEqual(len(pairs), 1)
        a = "不能の解除条件が付された法律行為は，無条件となる。"
        self.assertEqual([a[s:e] for s, e in pairs[0]["ad"]], ["無条件"])


class TextTest(unittest.TestCase):
    def test_display_text_drops_answer_slot(self):
        self.assertEqual(display_text("告訴は，代理人によってもすることができる。［№11］"), "告訴は，代理人によってもすることができる。")

    def test_comparable_keeps_length(self):
        t = "１０００万円，ＡＢ間"
        self.assertEqual(len(comparable(t)), len(t))
        self.assertEqual(comparable(t), "1000万円、AB間")

    def test_variant_spelling_is_not_a_difference(self):
        ra, rb = diff_ranges(comparable("建物の付属地として"), comparable("建物の附属地として"))
        self.assertEqual((ra, rb), ([], []))

    def test_small_equal_gaps_are_merged(self):
        ra, rb = diff_ranges("甲が乙に売った", "丙が丁に売った")
        self.assertEqual(ra, [[0, 3]])  # 「甲が乙」：間の「が」（1文字）でまとめる
        self.assertEqual(rb, [[0, 3]])

    def test_ranges_widen_to_the_whole_word(self):
        ra, rb = diff_ranges("無条件となる。", "無効となる。")
        self.assertEqual(ra, [[0, 3]])  # 「条件」ではなく「無条件」
        self.assertEqual(rb, [[0, 2]])  # 「効」ではなく「無効」


if __name__ == "__main__":
    unittest.main()
