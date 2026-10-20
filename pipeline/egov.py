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
    "借地借家法": ("shakuchi", "平成三年法律第九十号"),
    # T039：全科目の解説のために足した法令（法令番号が違えば取得時の法令名の照合で止まる）
    "行政手続法": ("gyotetsu", "平成五年法律第八十八号"),
    "行政事件訴訟法": ("gyoso", "昭和三十七年法律第百三十九号"),
    "国家賠償法": ("kokubai", "昭和二十二年法律第百二十五号"),
    "行政不服審査法": ("gyofuku", "平成二十六年法律第六十八号"),
    "地方自治法": ("chiji", "昭和二十二年法律第六十七号"),
    "行政代執行法": ("daishikko", "昭和二十三年法律第四十三号"),
    "行政機関の保有する情報の公開に関する法律": ("johokokai", "平成十一年法律第四十二号"),
    "個人情報の保護に関する法律": ("kojinjoho", "平成十五年法律第五十七号"),
    "国家行政組織法": ("kokkagyosei", "昭和二十三年法律第百二十号"),
    "国家公務員法": ("kokkokomuin", "昭和二十二年法律第百二十号"),
    "内閣法": ("naikaku", "昭和二十二年法律第五号"),
    "国会法": ("kokkai", "昭和二十二年法律第七十九号"),
    "裁判所法": ("saibansho", "昭和二十二年法律第五十九号"),
    "公職選挙法": ("koshoku", "昭和二十五年法律第百号"),
    "財政法": ("zaisei", "昭和二十二年法律第三十四号"),
    "皇室典範": ("koshitsu", "昭和二十二年法律第三号"),
    "手形法": ("tegata", "昭和七年法律第二十号"),
    "小切手法": ("kogitte", "昭和八年法律第五十七号"),
    "民事執行法": ("minshikko", "昭和五十四年法律第四号"),
    "民事保全法": ("minhozen", "平成元年法律第九十一号"),
    "人事訴訟法": ("jinji", "平成十五年法律第百九号"),
    "不動産登記法": ("fudosan", "平成十六年法律第百二十三号"),
    "一般社団法人及び一般財団法人に関する法律": ("ippanhojin", "平成十八年法律第四十八号"),
    "消費者契約法": ("shohisha", "平成十二年法律第六十一号"),
    "戸籍法": ("koseki", "昭和二十二年法律第二百二十四号"),
    "少年法": ("shonen", "昭和二十三年法律第百六十八号"),
    "裁判員の参加する刑事裁判に関する法律": ("saibanin", "平成十六年法律第六十三号"),
    "警察官職務執行法": ("keishoku", "昭和二十三年法律第百三十六号"),
    "道路交通法": ("doko", "昭和三十五年法律第百五号"),
    "国税通則法": ("kokuzei", "昭和三十七年法律第六十六号"),
    "裁判官弾劾法": ("dangai", "昭和二十二年法律第百三十七号"),
    "裁判官分限法": ("bungen", "昭和二十二年法律第百二十七号"),
    "学校教育法": ("gakko", "昭和二十二年法律第二十六号"),
    "デジタル庁設置法": ("digital", "令和三年法律第三十六号"),
    "内閣府設置法": ("naikakufu", "平成十一年法律第八十九号"),
    "独立行政法人通則法": ("dokuhou", "平成十一年法律第百三号"),
    "国立大学法人法": ("kokuritsudai", "平成十五年法律第百十二号"),
    "会社法施行規則": ("kaishakisoku", "平成十八年法務省令第十二号"),
    "労働組合法": ("rokumi", "昭和二十四年法律第百七十四号"),
    "住民基本台帳法": ("juki", "昭和四十二年法律第八十一号"),
    "出入国管理及び難民認定法": ("nyukan", "昭和二十六年政令第三百十九号"),
    "医療法": ("iryo", "昭和二十三年法律第二百五号"),
    "国税徴収法": ("choshu", "昭和三十四年法律第百四十七号"),
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


def sentence_text(el: ET.Element | None) -> str:
    """号などの本文。列（<Column>：「用語」と「定義」など）に分かれていれば全角空白でつなぐ。"""
    if el is None:
        return ""
    cols = el.findall("Column")
    if cols:
        return "　".join(texts(c, "Sentence") for c in cols)
    return texts(el, "Sentence")


def item_lines(el: ET.Element, title_tag: str, sentence_tag: str) -> list[str]:
    """号（Item）と、その細分（Subitem1〜）を1行ずつにする。"""
    lines = [f"{el.findtext(title_tag) or ''}　{sentence_text(el.find(sentence_tag))}"]
    for child in el:
        if child.tag.startswith("Subitem") and not child.tag.endswith(("Title", "Sentence")):
            lines += item_lines(child, f"{child.tag}Title", f"{child.tag}Sentence")
    return lines


def parse_article(art: ET.Element) -> dict:
    paragraphs = []
    for p in art.findall("Paragraph"):
        lines = [texts(p.find("ParagraphSentence"), "Sentence")]
        for item in p.findall("Item"):
            lines += item_lines(item, "ItemTitle", "ItemSentence")
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
