"""T048：検査の補助（漢数字の条番号・入れ子の「」・引用の食い違いの位置）。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from check_explanations import (KANJI_ARTICLE_RE, article_numbers, first_mismatch,  # noqa: E402
                                kanji_to_int, strip_quotes)


class KanjiArticleTest(unittest.TestCase):
    def test_kanji_to_int(self):
        self.assertEqual([kanji_to_int(s) for s in ["七", "十一", "四十一", "百", "四百二十三", "千五十"]],
                         [7, 11, 41, 100, 423, 1050])

    def test_only_dai_form_is_picked(self):
        found = [m.group(0) for m in KANJI_ARTICLE_RE.finditer("法第四十一条は、和解の一条項として、前二条の請求")]
        self.assertEqual(found, ["第四十一条"])

    def test_article_numbers_in_any_numeral(self):
        self.assertEqual(article_numbers("法第１２条、5条の2、第九十八条の二"), {"12", "5_2", "98_2"})


class StripQuotesTest(unittest.TestCase):
    def test_nested_quotes_are_removed(self):
        self.assertEqual(strip_quotes("前「外（以下「内」という。）第四百二十三条」後"), "前後")


class FirstMismatchTest(unittest.TestCase):
    def test_points_at_differing_character(self):
        hint = first_mismatch("父母は、子の心身の健全な発達を図る", "父母は，子の心身の健全な発達を図るため")
        self.assertIn("4文字目", hint)

    def test_empty_when_quote_matches(self):
        self.assertEqual(first_mismatch("子の心身", "父母は、子の心身の健全な"), "")
