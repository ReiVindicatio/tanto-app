"""T013：民法の2019年以前で、現行の条文では公式の○×を説明できない肢（law_changed）の検査と、flags.json への記録。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from check_explanations import LAW_CHANGED, check_law_changed, status_of  # noqa: E402
from explain_commit import LAW_CHANGED_BY, add_law_changed_flags  # noqa: E402

QUOTE = "引き渡された目的物が種類、品質又は数量に関して契約の内容に適合しないものであるとき"
REASON = f"今の民法は売主の責任を契約不適合として定め（「{QUOTE}」。562条）、肢の前提の瑕疵担保責任の規定はない。"
CITE = [{"type": "statute", "law": "民法", "article": "562", "paragraphs": ["1"], "quote": QUOTE}]


def entry(**kw):
    return {"target": {"type": "statement", "id": "yobi-2018-minpo-q20-a"}, "version": 1, "stated_truth": False,
            "law_changed": REASON, "citations": [dict(c) for c in CITE], "notes": [], **kw}


class CheckLawChangedTest(unittest.TestCase):
    def test_valid_entry_is_law_changed_not_failure(self):
        f = check_law_changed(entry(), "肢の文", "問題文", "minpo", 2018)
        self.assertEqual(f, [LAW_CHANGED])
        self.assertEqual(status_of(f), "law_changed")

    def test_only_old_minpo(self):
        f = check_law_changed(entry(), "肢の文", "問題文", "minpo", 2020)
        self.assertEqual(status_of(f), "flagged")
        self.assertTrue(any("2019年以前" in x for x in f))
        self.assertEqual(status_of(check_law_changed(entry(), "肢", "問", "keiho", 2015)), "flagged")

    def test_no_body_or_conclusion(self):
        f = check_law_changed(entry(body="今の法律では○になる。"), "肢", "問", "minpo", 2015)
        self.assertTrue(any("conclusion・body" in x for x in f))

    def test_reason_needs_citations_and_matching_quote(self):
        self.assertTrue(any("citations" in x for x in check_law_changed(entry(citations=[]), "肢", "問", "minpo", 2015)))
        bad = [dict(CITE[0], quote="瑕疵担保責任を負う")]
        f = check_law_changed(entry(citations=bad), "肢", "問", "minpo", 2015)
        self.assertTrue(any("一致しない" in x for x in f))

    def test_article_in_reason_must_be_cited(self):
        f = check_law_changed(entry(law_changed=REASON + "566条も同じ。"), "肢", "問", "minpo", 2015)
        self.assertTrue(any("566条" in x for x in f))

    def test_status_of(self):
        self.assertEqual(status_of([]), "published")
        self.assertEqual(status_of(["🔴 公式の○×と食い違う", LAW_CHANGED]), "flagged")


class AddFlagsTest(unittest.TestCase):
    def test_adds_open_law_changed_flag_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            exp = Path(tmp) / "explanations" / "yobi" / "2018" / "minpo"
            exp.mkdir(parents=True)
            (exp / "q20.json").write_text(json.dumps({"explanations": [
                dict(entry(), status="law_changed"),
                {"target": {"type": "statement", "id": "yobi-2018-minpo-q20-b"}, "status": "published"},
            ]}, ensure_ascii=False), encoding="utf-8")
            flags = Path(tmp) / "flags.json"
            flags.write_text(json.dumps({"note": "", "flags": []}), encoding="utf-8")

            self.assertEqual(add_law_changed_flags(Path(tmp) / "explanations", flags), ["yobi-2018-minpo-q20-a"])
            doc = json.loads(flags.read_text(encoding="utf-8"))
            self.assertEqual(len(doc["flags"]), 1)
            f = doc["flags"][0]
            self.assertEqual((f["kind"], f["status"], f["raised_by"], f["reason"]), ("law_changed", "open", LAW_CHANGED_BY, REASON))
            # 2回目は足さない
            self.assertEqual(add_law_changed_flags(Path(tmp) / "explanations", flags), [])


if __name__ == "__main__":
    unittest.main()
