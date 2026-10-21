"""T041：裁判例検索の結果・判決のページの取り出しと、解説の判例まわりの検査。

通信はしない（courts.go.jp のページの抜粋を tests/fixtures/courts/ に置いてある）。
使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
import urllib.parse
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import check_explanations as ce  # noqa: E402
import courts  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "courts"


class CourtsParseTest(unittest.TestCase):
    def test_search_result(self):
        total, rows = courts.parse_search((FIXTURES / "search_ryuchiken.html").read_text(encoding="utf-8"))
        self.assertEqual(total, 1)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["id"], "52639")
        self.assertEqual(r["case_number"], "昭和45(オ)1055")
        self.assertEqual(r["case_name"], "建物明渡請求")
        self.assertEqual(r["date"], "昭和47年11月16日")
        self.assertEqual(r["court"], "最高裁判所第一小法廷")
        self.assertEqual(r["url"], "https://www.courts.go.jp/hanrei/52639/detail2/index.html")

    def test_detail_page(self):
        f = courts.parse_detail((FIXTURES / "detail_52639.html").read_text(encoding="utf-8"))
        self.assertEqual(f["事件番号"], "昭和45(オ)1055")
        self.assertEqual(f["裁判年月日"], "昭和47年11月16日")
        self.assertEqual(f["法廷名"], "最高裁判所第一小法廷")
        self.assertTrue(f["判示事項"].startswith("一、甲所有の物を買受けた乙"))
        self.assertIn("留置権の抗弁権を主張することができる", f["裁判要旨"])
        self.assertEqual(f["参照法条"], "民法295条，民訴法186条")

    def test_search_url_with_date(self):
        url = courts.search_url(["留置権"], date="1972-11-16")
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        self.assertEqual(q["filter[division][]"], "1")
        self.assertEqual((q["filter[judgeGengoFrom]"], q["filter[judgeYearFrom]"]), ("昭和", "47"))
        self.assertEqual((q["filter[judgeMonthTo]"], q["filter[judgeDayTo]"]), ("11", "16"))
        self.assertEqual(courts.parse_date("昭和47-11-16"), ("昭和", 47, 11, 16))
        self.assertEqual(courts.parse_date("昭和57年6月8日"), ("昭和", 57, 6, 8))
        self.assertEqual(courts.parse_date("平成元年1月8日"), ("平成", 1, 1, 8))
        self.assertEqual(courts.parse_date("2019-05-01"), ("令和", 1, 5, 1))
        self.assertEqual(courts.parse_date("2019-04-30"), ("平成", 31, 4, 30))

    def test_search_url_narrows_with_query2(self):
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(courts.search_url(["相殺", "差押", "転付"])).query))
        self.assertEqual(q["query1"], "相殺")  # query1 はスペース区切りが OR になるので1語だけ
        self.assertEqual(q["query2"], "差押 転付")
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(courts.search_url(["留置権"])).query))
        self.assertNotIn("query2", q)

    def test_site_error_is_not_zero_hits(self):
        page = ('<ul class="errorMessage"><li><span>検索結果が2000件を超えました。'
                '「全文検索」欄の検索語を追加・変更してください。</span></li></ul>')
        with self.assertRaises(courts.SearchError):
            courts.parse_search(page)

    def test_search_url_all_courts_and_page(self):
        url = courts.search_url(["名誉毀損"], all_courts=True, page=3)
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        self.assertNotIn("filter[division][]", q)
        self.assertEqual(q["offset"], "60")

    def test_before_showa_is_rejected(self):
        with self.assertRaises(ValueError):
            courts.parse_date("1920-01-01")
        with self.assertRaises(ValueError):
            courts.parse_date("大正9年3月1日")


def exp(body: str, **kw) -> dict:
    return {"conclusion": "×", "body": body, **kw}


class CaseChecksTest(unittest.TestCase):
    def test_pending_mark_without_field_warns_for_old_prompts(self):
        fails, warns = ce.case_checks(exp("判例あり（要確認）。"), strict_pending=False)
        self.assertEqual(fails, [])
        self.assertEqual(len(warns), 1)

    def test_pending_mark_without_field_fails_from_v3(self):
        fails, _ = ce.case_checks(exp("判例あり（要確認）。"), strict_pending=True)
        self.assertEqual(len(fails), 1)

    def test_pending_cases_must_match_body(self):
        ok = exp("判例あり（要確認）。", pending_cases=[{"about": "留置権の抗弁", "searched": ["courts.py search 留置権"]}])
        self.assertEqual(ce.case_checks(ok, strict_pending=True), ([], []))
        stray = exp("条文で決まる。", pending_cases=[{"about": "x", "searched": ["y"]}])
        self.assertEqual(len(ce.case_checks(stray, strict_pending=True)[0]), 1)
        empty = exp("判例あり（要確認）。", pending_cases=[])
        self.assertEqual(len(ce.case_checks(empty, strict_pending=True)[0]), 1)
        malformed = exp("判例あり（要確認）。", pending_cases=[{"about": "x"}])
        self.assertEqual(len(ce.case_checks(malformed, strict_pending=True)[0]), 1)

    def test_case_urls_outside_courts(self):
        e = exp("本文", cases=[{"name": "x", "verified_urls": ["https://www.law-lib.jp/x"]}])
        fails, warns = ce.case_checks(e, strict_pending=True)
        self.assertEqual((len(fails), len(warns)), (0, 1))
        with mock.patch.object(ce, "STRICT_CASE_URLS", True):
            fails, warns = ce.case_checks(e, strict_pending=True)
        self.assertEqual((len(fails), len(warns)), (1, 0))
        ok = exp("本文", cases=[{"name": "x", "verified_urls": ["https://www.courts.go.jp/hanrei/52639/detail2/index.html"]}])
        self.assertEqual(ce.case_checks(ok, strict_pending=True), ([], []))


if __name__ == "__main__":
    unittest.main()
