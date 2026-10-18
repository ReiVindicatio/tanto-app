"""e-Gov 法令 API（v1）から条文を取得し、data/statutes/ に保存する。

解説で引用してよい条文の文言は、ここに保存した本文だけ（CLAUDE.md 禁止事項4）。
保存するもの：取得 URL・取得日・項ごとの本文・本文全体の sha256。

使い方：
  python3 pipeline/egov.py 民法 5 6 20 98_2 125      # 条番号（枝番は 98_2 の形）
  python3 pipeline/egov.py 民法 5 --refresh            # 取り直す（保存済みでも）
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from common import ROOT

STATUTES = ROOT / "data" / "statutes"
LAWS = {
    "民法": ("minpo", "明治二十九年法律第八十九号"),
    "刑法": ("keiho", "明治四十年法律第四十五号"),
    "会社法": ("kaisha", "平成十七年法律第八十六号"),
    "民事訴訟法": ("minso", "平成八年法律第百九号"),
}


def plain(el: ET.Element) -> str:
    """要素の文字列。ルビ（<Rt>）の読みは除く（「瑕疵かし」→「瑕疵」）。"""
    out = [el.text or ""]
    for child in el:
        if child.tag != "Rt":
            out.append(plain(child))
        out.append(child.tail or "")
    return "".join(out)


def texts(el: ET.Element | None, tag: str) -> str:
    if el is None:
        return ""
    return "".join(plain(s) for s in el.iter(tag))


def parse_article(xml: bytes) -> dict:
    root = ET.fromstring(xml)
    code = root.findtext("Result/Code")
    if code != "0":
        raise ValueError(f"e-Gov API がエラー：{code} {root.findtext('Result/Message')}")
    art = root.find("ApplData/LawContents/Article")
    if art is None:
        raise ValueError("Article 要素がない")
    paragraphs = []
    for p in art.findall("Paragraph"):
        lines = [texts(p.find("ParagraphSentence"), "Sentence")]
        for item in p.findall("Item"):
            title = item.findtext("ItemTitle") or ""
            lines.append(f"{title}　{texts(item.find('ItemSentence'), 'Sentence')}")
        paragraphs.append({"num": p.get("Num"), "text": "\n".join(lines)})
    return {
        "title": art.findtext("ArticleTitle"),
        "caption": art.findtext("ArticleCaption"),
        "paragraphs": paragraphs,
    }


def full_text(a: dict) -> str:
    return "\n".join(p["text"] for p in a["paragraphs"])


def fetch(law: str, article: str, refresh: bool = False) -> dict:
    law_id, law_num = LAWS[law]
    out = STATUTES / law_id / f"{article}.json"
    if out.exists() and not refresh:
        return json.loads(out.read_text(encoding="utf-8"))
    url = f"https://laws.e-gov.go.jp/api/1/articles;lawNum={urllib.parse.quote(law_num)};article={article}"
    with urllib.request.urlopen(url, timeout=30) as r:
        xml = r.read()
    a = parse_article(xml)
    body = full_text(a)
    rec = {
        "law": law,
        "law_num": law_num,
        "article": article,
        **a,
        "text": body,
        "text_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "source": "e-Gov 法令 API v1",
        "url": url,
        "fetched_at": datetime.date.today().isoformat(),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return rec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("law", choices=sorted(LAWS))
    ap.add_argument("articles", nargs="+")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    for art in args.articles:
        try:
            rec = fetch(args.law, art, args.refresh)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"🔴 {args.law} {art}：{e}")
        print(f"✅ {rec['law']} {rec['title']}{rec['caption'] or ''}（{rec['fetched_at']}）")
        print("   " + rec["text"].replace("\n", "\n   "))


if __name__ == "__main__":
    main()
