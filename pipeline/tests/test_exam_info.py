"""T028：法務省の「短答式試験の結果」・受験案内の読み取り。実際の PDF の pdftotext の出力（NFKC 後）の一部で確かめる。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from exam_info import parse_distribution, parse_guide, rows_of, score_section, SUBJECTS  # noqa: E402

FULLS = {"kenpo": 2, "minpo": 3, "keiho": 2}


class DistributionTest(unittest.TestCase):
    def test_blank_rows_and_count_only_cells(self):
        # R04：人員が0の得点は数字が空く（「1 」の行は憲法・刑法の得点だけ）。R06：0人の行は累計の欄が空くことがある
        text = "\n".join([
            "2      0              3      1    1   0.03%    2     3     3  30.0%",
            "1                     2                        1",
            "0     10   10 100.00%  1      4    5   50.0%   0     7    10 100.00%",
            "                       0      5   10 100.00%",
        ])
        d = parse_distribution(text, FULLS, 10)
        self.assertEqual(d["kenpo"], {"2": 0, "1": 0, "0": 10})
        self.assertEqual(d["minpo"], {"3": 1, "2": 0, "1": 4, "0": 5})
        self.assertEqual(d["keiho"], {"2": 3, "1": 0, "0": 7})

    def test_column_ends_when_cumulative_reaches_total(self):
        # R06：憲法は累計が採点対象者数に達したところで列が終わり、次の行の「0」は民法の得点
        text = "\n".join([
            "2      4    4   40.0%   3     1    1  10.0%   2     5     5  50.0%",
            "1      6   10  100.0%   2     2    3  30.0%   1     5    10 100.0%",
            "                        1     3    6  60.0%",
            "                        0     4   10 100.0%",
        ])
        d = parse_distribution(text, FULLS, 10)
        self.assertEqual(d["kenpo"], {"2": 4, "1": 6, "0": 0})
        self.assertEqual(d["minpo"], {"3": 1, "2": 2, "1": 3, "0": 4})

    def test_omitted_zero_rows_after_other_columns_end(self):
        # R03：ほかの科目が終わったあと、民法の0人の得点の行そのものが省かれる（1 点の行がない）
        text = "\n".join([
            "2     10   10  100.0%  3      2    2  20.0%   2    10    10 100.0%",
            "1                      2      5    7  70.0%   1",
            "                       0      3   10 100.0%",
        ])
        d = parse_distribution(text, FULLS, 10)
        self.assertEqual(d["minpo"], {"3": 2, "2": 5, "1": 0, "0": 3})


class GuideTest(unittest.TestCase):
    def test_yobi_reads_only_short_answer_timetable(self):
        text = "\n".join([
            "(1) 短答式試験",
            "  8:45  9:15  9:45~11:15(1時間30分)  民法・商法・民事訴訟法",
            "   ―   11:45  12:00~13:00(1時間)  憲法・行政法",
            "(2) 論文式試験",
            "9/12(土) 8:30 9:00 9:10 9:30~11:50(2時間20分) 憲法・行政法",
        ])
        self.assertEqual(parse_guide(text), {"minji": 90, "kenpo-gyosei": 60})

    def test_shiho_short_answer_lines(self):
        text = "\n".join([
            "8:30 9:00 9:10 9:30~12:30 (3時間) 論文式試験 (選択科目)",
            "9:00 9:30 9:40 10:00~11:15 (1時間15分) 短答式試験 (民法)",
            "7/19(日) - - 11:45 12:00~12:50 (50分) 短答式試験 (憲法)",
        ])
        self.assertEqual(parse_guide(text), {"minpo": 75, "kenpo": 50})


class ScoreTableTest(unittest.TestCase):
    def test_spaced_names_and_numbers_on_next_line(self):
        # R08 司法：科目名の字の間に空白、数字は次の行、満点は「(50 点満点)」
        text = "\n".join([
            "3 短答式試験の得点",
            "          合   計   得    点",
            "                               167         0     118.1",
            "          (175点満点)",
            "                   憲   法",
            "                                 48        0     28.8      315人",
            "                  (50 点満点)",
            "4 参考",
        ])
        rows = rows_of(score_section(text), SUBJECTS | {"合計得点": "total"})
        self.assertEqual(rows["kenpo"], {"full": 50, "max": 48, "min": 0, "avg": 28.8})
        self.assertEqual(rows["total"], {"full": 175, "max": 167, "min": 0, "avg": 118.1})


if __name__ == "__main__":
    unittest.main()
