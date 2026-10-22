"""egov.py の読み取り：前文・別表・条のない本則（2026-10-22）。法令の文言ではなく作り物の XML で確かめる。

使い方：python3 -m unittest discover -s pipeline/tests
"""
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from egov import parse_appendix, parse_article  # noqa: E402

PREAMBLE = """<Preamble>
  <Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence Num="1">第一段の文。</Sentence></ParagraphSentence></Paragraph>
  <Paragraph Num="2"><ParagraphNum/><ParagraphSentence><Sentence Num="1">第二段の文。</Sentence></ParagraphSentence></Paragraph>
</Preamble>"""

APPENDIX = """<AppdxTable>
  <AppdxTableTitle>別表第一</AppdxTableTitle>
  <RelatedArticleNum>（第三条関係）</RelatedArticleNum>
  <Item Num="1"><ItemTitle>一</ItemTitle><ItemSentence><Sentence Num="1">甲の罪</Sentence></ItemSentence></Item>
  <Item Num="2"><ItemTitle>二</ItemTitle><ItemSentence><Sentence Num="1">乙の罪</Sentence></ItemSentence></Item>
</AppdxTable>"""

MAIN_WITHOUT_ARTICLES = """<MainProvision>
  <Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence Num="1">本則の一文。</Sentence></ParagraphSentence></Paragraph>
</MainProvision>"""


class EgovPartsTest(unittest.TestCase):
    def test_preamble_paragraphs_are_kept_as_items(self):
        a = parse_article(ET.fromstring(PREAMBLE), title="前文")
        self.assertEqual(a["title"], "前文")
        self.assertEqual([(p["num"], p["text"]) for p in a["paragraphs"]], [("1", "第一段の文。"), ("2", "第二段の文。")])

    def test_appendix_items_become_one_paragraph(self):
        a = parse_appendix(ET.fromstring(APPENDIX), "別表第一")
        self.assertEqual(a["title"], "別表第一")
        self.assertEqual(a["caption"], "（第三条関係）")
        self.assertEqual(a["paragraphs"], [{"num": "1", "text": "一　甲の罪\n二　乙の罪"}])

    def test_main_provision_without_articles(self):
        a = parse_article(ET.fromstring(MAIN_WITHOUT_ARTICLES), title="本則")
        self.assertEqual(a["text"], "本則の一文。")


if __name__ == "__main__":
    unittest.main()
