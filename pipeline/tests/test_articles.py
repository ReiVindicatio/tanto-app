"""T060：条文から逆引き。条 → その条を解説が引いた肢カードの数え方。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from export import articles  # noqa: E402


def st(id, truth=True, **kw):
    return {"id": id, "truth_at_exam": {"value": truth} if truth is not None else None, **kw}


def exp(sid, *cites):
    return {"statement_id": sid, "citations": [{"type": "statute", "law": l, "article": a} for l, a in cites]}


class ArticlesTest(unittest.TestCase):
    def test_counts_every_citation_of_representative_cards_only(self):
        docs = [{
            "statements": [
                st("yobi-2026-minpo-q01-a"),
                st("yobi-2026-minpo-q01-b", card="yobi-2020-minpo-q09-a"),  # 名寄せの代表でない
                st("yobi-2026-minpo-q01-c", review_flag={"kind": "law_changed"}),  # 肢カードから外した
                st("yobi-2026-minpo-q01-d", truth=None),  # ○×がない
            ],
            "explanations": [
                exp("yobi-2026-minpo-q01-a", ("民法", "94"), ("民法", "96")),  # 2つ目の引用も数える
                exp("yobi-2026-minpo-q01-b", ("民法", "94")),
                exp("yobi-2026-minpo-q01-c", ("民法", "94")),
                exp("yobi-2026-minpo-q01-d", ("民法", "94")),
            ],
        }]
        index, texts = articles(docs)
        self.assertEqual(index["laws"]["民法"]["articles"], {"94": "yobi-2026-minpo-q01-a", "96": "yobi-2026-minpo-q01-a"})
        self.assertEqual(index["laws"]["民法"]["id"], "minpo")
        self.assertEqual(index["laws"]["民法"]["captions"]["94"], "虚偽表示")
        self.assertEqual(texts["minpo"]["articles"]["94"]["caption"], "（虚偽表示）")


if __name__ == "__main__":
    unittest.main()
