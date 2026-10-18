"""e-Gov 法令 API（v1）から法令全体を取得し、条ごとに分けて data/statutes/<法令>.json に保存する。

解説で引用してよい条文の文言は、ここに保存した本文だけ（CLAUDE.md 禁止事項4）。
保存するもの：取得 URL・取得日・XML 全体の sha256・条ごとの項の本文と sha256。
本文は取得日時点の現行法。取り直して条の sha256 が変わったら、改正があったということ。

使い方：
  python3 pipeline/egov.py --fetch 民法 刑法     # 法令全体を取得して保存（取り直しも同じ）
  python3 pipeline/egov.py --fetch-all           # LAWS の全法令
  python3 pipeline/egov.py 民法 5 6 98_2         # 保存済みの条文を表示（未取得なら先に取得する）
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
# 法令名 → (保存名, 法令番号)。取得時に e-Gov の法令名と一致するかを確かめる
LAWS = {
    "民法": ("minpo", "明治二十九年法律第八十九号"),
    "刑法": ("keiho", "明治四十年法律第四十五号"),
    "会社法": ("kaisha", "平成十七年法律第八十六号"),
    "民事訴訟法": ("minso", "平成八年法律第百九号"),
    "刑事訴訟法": ("keiso", "昭和二十三年法律第百三十一号"),
    "日本国憲法": ("kenpo", "昭和二十一年憲法"),
    "商法": ("shoho", "明治三十二年法律第四十八号"),
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


def parse_article(art: ET.Element) -> dict:
    paragraphs = []
    for p in art.findall("Paragraph"):
        lines = [texts(p.find("ParagraphSentence"), "Sentence")]
        for item in p.findall("Item"):
            title = item.findtext("ItemTitle") or ""
            lines.append(f"{title}　{texts(item.find('ItemSentence'), 'Sentence')}")
        paragraphs.append({"num": p.get("Num"), "text": "\n".join(lines)})
    body = "\n".join(p["text"] for p in paragraphs)
    return {
        "title": art.findtext("ArticleTitle"),
        "caption": art.findtext("ArticleCaption"),
        "paragraphs": paragraphs,
        "text": body,
        "text_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    }


def law_path(law: str):
    return STATUTES / f"{LAWS[law][0]}.json"


def fetch_law(law: str) -> dict:
    law_id, law_num = LAWS[law]
    url = f"https://laws.e-gov.go.jp/api/1/lawdata/{urllib.parse.quote(law_num)}"
    with urllib.request.urlopen(url, timeout=120) as r:
        xml = r.read()
    root = ET.fromstring(xml)
    if root.findtext("Result/Code") != "0":
        raise ValueError(f"e-Gov API がエラー：{root.findtext('Result/Message')}")
    title = (root.findtext(".//LawBody/LawTitle") or "").strip()
    if title != law:
        raise ValueError(f"法令番号 {law_num} の法令名が「{title}」で、「{law}」と一致しない")
    main = root.find(".//LawBody/MainProvision")
    articles = {}
    for art in main.iter("Article"):  # 附則（SupplProvision）は含めない
        num = art.get("Num")
        if num in articles:
            raise ValueError(f"条番号が重複：{num}")
        articles[num] = parse_article(art)

    old = json.loads(law_path(law).read_text(encoding="utf-8")) if law_path(law).exists() else None
    rec = {
        "law": law,
        "law_num": law_num,
        "source": "e-Gov 法令 API v1（lawdata）",
        "url": url,
        "fetched_at": datetime.date.today().isoformat(),
        "xml_sha256": hashlib.sha256(xml).hexdigest(),
        "article_count": len(articles),
        "articles": articles,
    }
    STATUTES.mkdir(parents=True, exist_ok=True)
    law_path(law).write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if old:
        changed = [n for n, a in articles.items() if n in old["articles"] and old["articles"][n]["text_sha256"] != a["text_sha256"]]
        added = [n for n in articles if n not in old["articles"]]
        removed = [n for n in old["articles"] if n not in articles]
        if changed or added or removed:
            print(f"⚠️  {law}：前回（{old['fetched_at']}）から本文が変わった条 {changed[:20]}・増えた条 {added[:20]}・消えた条 {removed[:20]}")
    return rec


def load_law(law: str) -> dict:
    p = law_path(law)
    if not p.exists():
        return fetch_law(law)
    return json.loads(p.read_text(encoding="utf-8"))


def load_article(law: str, article: str) -> dict | None:
    """条の本文に、法令単位の取得情報（url・fetched_at）を添えて返す。"""
    if law not in LAWS or not law_path(law).exists():
        return None
    rec = json.loads(law_path(law).read_text(encoding="utf-8"))
    a = rec["articles"].get(article)
    if a is None:
        return None
    return {**a, "law": law, "article": article, "url": rec["url"], "fetched_at": rec["fetched_at"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", nargs="+", choices=sorted(LAWS), metavar="法令", help="法令全体を取得して保存")
    ap.add_argument("--fetch-all", action="store_true")
    ap.add_argument("law", nargs="?", choices=sorted(LAWS))
    ap.add_argument("articles", nargs="*")
    args = ap.parse_args()

    targets = sorted(LAWS) if args.fetch_all else (args.fetch or [])
    for law in targets:
        try:
            rec = fetch_law(law)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"🔴 {law}：{e}")
        print(f"✅ {law}（{rec['law_num']}）：{rec['article_count']}条を保存（{rec['fetched_at']}）")

    if args.law:
        rec = load_law(args.law)
        for art in args.articles:
            a = rec["articles"].get(art)
            if a is None:
                sys.exit(f"🔴 {args.law} に条番号 {art} がない（枝番は 98_2 の形）")
            print(f"✅ {args.law} {a['title']}{a['caption'] or ''}（{rec['fetched_at']} 取得）")
            print("   " + a["text"].replace("\n", "\n   "))


if __name__ == "__main__":
    main()
