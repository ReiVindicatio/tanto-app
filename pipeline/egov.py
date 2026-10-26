"""e-Gov 法令 API（v1）から法令全体を取得し、条ごとに分けて data/statutes/<法令>.json に保存する。

解説で引用してよい条文の文言は、ここに保存した本文だけ（CLAUDE.md 禁止事項4）。
保存するもの：取得 URL・取得日・XML 全体の sha256・条ごとの項の本文と sha256。
本文は取得日時点の現行法。取り直して条の sha256 が変わったら、改正があったということ。

使い方：
  python3 pipeline/egov.py --fetch 民法 刑法     # 法令全体を取得して保存（取り直しも同じ）
  python3 pipeline/egov.py --fetch-all           # LAWS の全法令
  python3 pipeline/egov.py 民法 5 6 98_2         # 保存済みの条文を表示（未取得なら先に取得する）
  python3 pipeline/egov.py 日本国憲法 前文        # 前文・別表（「別表第一」など）・条のない法令の本文（「本則」）も条と同じに引ける
  python3 pipeline/egov.py --fetch-toc 民法       # 目次（条ごとの編・章・節）だけを取得して data/statutes/toc/ に保存（分野タグ：T016）
  python3 pipeline/egov.py 民法 570 --asof 2018-05-01   # 出題時点の本文（T013。revisions.py --with-old-text で保存した版。読むだけで引用しない）
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
TOC = STATUTES / "toc"
# 目次の階層（e-Gov の要素名 → 見出しの要素名）
TOC_LEVELS = {"Part": "PartTitle", "Chapter": "ChapterTitle", "Section": "SectionTitle", "Subsection": "SubsectionTitle", "Division": "DivisionTitle"}
# 法令名 → (保存名, 法令番号[, e-Gov 上の法令名])。取得時に e-Gov の法令名と一致するかを確かめる。
# e-Gov の法令名が通称と違う法令（題名のない古い法律）は、3つ目に e-Gov 上の法令名を書く
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
    "議院における証人の宣誓及び証言等に関する法律": ("giinshogen", "昭和二十二年法律第二百二十五号"),
    "警察法": ("keisatsu", "昭和二十九年法律第百六十二号"),
    "検察審査会法": ("kensatsushinsa", "昭和二十三年法律第百四十七号"),
    "国籍法": ("kokuseki", "昭和二十五年法律第百四十七号"),
    "破壊活動防止法": ("hakai", "昭和二十七年法律第二百四十号"),
    "関税法": ("kanzei", "昭和二十九年法律第六十一号"),
    "関税定率法": ("kanzeiteiritsu", "明治四十三年法律第五十四号"),
    "生活保護法": ("seikatsuhogo", "昭和二十五年法律第百四十四号"),
    "感染症の予防及び感染症の患者に対する医療に関する法律": ("kansensho", "平成十年法律第百十四号"),
    "鉄道営業法": ("tetsudoeigyo", "明治三十三年法律第六十五号"),
    "郵便法": ("yubin", "昭和二十二年法律第百六十五号"),
    "仲裁法": ("chusai", "平成十五年法律第百三十八号"),
    "医師法": ("ishi", "昭和二十三年法律第二百一号"),
    "廃棄物の処理及び清掃に関する法律": ("haikibutsu", "昭和四十五年法律第百三十七号"),
    "毒物及び劇物取締法": ("dokugeki", "昭和二十五年法律第三百三号"),
    "車両制限令": ("sharyoseigen", "昭和三十六年政令第二百六十五号"),
    "社債、株式等の振替に関する法律": ("furikae", "平成十三年法律第七十五号"),
    "国事行為の臨時代行に関する法律": ("kokujikoi", "昭和三十九年法律第八十三号"),
    "公害健康被害の補償等に関する法律": ("kogaikenko", "昭和四十八年法律第百十一号"),
    "地方自治法施行令": ("chijirei", "昭和二十二年政令第十六号"),
    "自動車の運転により人を死傷させる行為等の処罰に関する法律": ("jidosha_shisho", "平成二十五年法律第八十六号"),
    "鉱業法": ("kogyo", "昭和二十五年法律第二百八十九号"),
    "弁護士法": ("bengoshi", "昭和二十四年法律第二百五号"),
    "旅券法": ("ryoken", "昭和二十六年法律第二百六十七号"),
    "民事訴訟費用等に関する法律": ("minsohiyo", "昭和四十六年法律第四十号"),
    "商業登記法": ("shogyotoki", "昭和三十八年法律第百二十五号"),
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
    "会社計算規則": ("keisankisoku", "平成十八年法務省令第十三号"),
    "労働組合法": ("rokumi", "昭和二十四年法律第百七十四号"),
    "刑事補償法": ("keiho_hosho", "昭和二十五年法律第一号"),
    "消防法": ("shobo", "昭和二十三年法律第百八十六号"),
    "道路法": ("doro", "昭和二十七年法律第百八十号"),
    "都市計画法": ("toshikeikaku", "昭和四十三年法律第百号"),
    "建築基準法": ("kenchiku", "昭和二十五年法律第二百一号"),
    "土地収用法": ("shuyo", "昭和二十六年法律第二百十九号"),
    "日本国憲法の改正手続に関する法律": ("kokumintohyo", "平成十九年法律第五十一号"),
    "会計法": ("kaikei", "昭和二十二年法律第三十五号"),
    "公営住宅法": ("koeijutaku", "昭和二十六年法律第百九十三号"),
    "水道法": ("suido", "昭和三十二年法律第百七十七号"),
    "破産法": ("hasan", "平成十六年法律第七十五号"),
    "住民基本台帳法": ("juki", "昭和四十二年法律第八十一号"),
    "出入国管理及び難民認定法": ("nyukan", "昭和二十六年政令第三百十九号"),
    "医療法": ("iryo", "昭和二十三年法律第二百五号"),
    "国税徴収法": ("choshu", "昭和三十四年法律第百四十七号"),
    "宗教法人法": ("shukyohojin", "昭和二十六年法律第百二十六号"),
    "風俗営業等の規制及び業務の適正化等に関する法律": ("fuei", "昭和二十三年法律第百二十二号"),
    "自転車競技法": ("jitenshakyogi", "昭和二十三年法律第二百九号"),
    "採石法": ("saiseki", "昭和二十五年法律第二百九十一号"),
    "社債、株式等の振替に関する法律施行令": ("furikaerei", "平成十四年政令第三百六十二号"),
    "覚醒剤取締法": ("kakuseizai", "昭和二十六年法律第二百五十二号"),
    "政治資金規正法": ("seijishikin", "昭和二十三年法律第百九十四号"),
    "政党助成法": ("seitojosei", "平成六年法律第五号"),
    "教育基本法": ("kyoikukihon", "平成十八年法律第百二十号"),
    "森林法": ("shinrin", "昭和二十六年法律第二百四十九号"),
    "登録免許税法": ("tourokumenkyo", "昭和四十二年法律第三十五号"),
    "国有財産法": ("kokuyuzaisan", "昭和二十三年法律第七十三号"),
    "所得税法": ("shotokuzei", "昭和四十年法律第三十三号"),
    "軽犯罪法": ("keihanzai", "昭和二十三年法律第三十九号"),
    "火薬類取締法": ("kayakurui", "昭和二十五年法律第百四十九号"),
    "都市公園法": ("toshikoen", "昭和三十一年法律第七十九号"),
    "地方公務員災害補償法": ("chikosai", "昭和四十二年法律第百二十一号"),
    "酒税法": ("shuzei", "昭和二十八年法律第六号"),
    "建物の区分所有等に関する法律": ("kubunshoyu", "昭和三十七年法律第六十九号"),
    "任意後見契約に関する法律": ("ninikoken", "平成十一年法律第百五十号"),
    "家事事件手続法": ("kaji", "平成二十三年法律第五十二号"),
    "放送法": ("hoso", "昭和二十五年法律第百三十二号"),
    # 2026-10-21：解説の生成で足りなかった法令
    "刑事収容施設及び被収容者等の処遇に関する法律": ("keijishuyo", "平成十七年法律第五十号"),
    "労働基準法": ("rodokijun", "昭和二十二年法律第四十九号"),
    "地方財政法": ("chihozaisei", "昭和二十三年法律第百九号"),
    "自衛隊法": ("jieitai", "昭和二十九年法律第百六十五号"),
    "地方公務員法": ("chihokomuin", "昭和二十五年法律第二百六十一号"),
    "麻薬及び向精神薬取締法": ("mayaku", "昭和二十八年法律第十四号"),
    "犯罪捜査のための通信傍受に関する法律": ("tsushinbouju", "平成十一年法律第百三十七号"),
    "非訟事件手続法": ("hisho", "平成二十三年法律第五十一号"),
    "国民健康保険法": ("kokuho", "昭和三十三年法律第百九十二号"),
    "風俗営業等の規制及び業務の適正化等に関する法律施行令": ("fueiho_rei", "昭和五十九年政令第三百十九号"),
    "弁護士法": ("bengoshi", "昭和二十四年法律第二百五号"),
    "失火ノ責任ニ関スル法律": ("shikka", "明治三十二年法律第四十号", "明治三十二年法律第四十号（失火ノ責任ニ関スル法律）"),
    # T013：民法の公正証書遺言の手続（969条）の一部が公証人法に移った肢のため
    "公証人法": ("koshonin", "明治四十一年法律第五十三号"),
    "立木ニ関スル法律": ("ryuboku", "明治四十二年法律第二十二号", "明治四十二年法律第二十二号（立木ニ関スル法律）"),
    "身元保証ニ関スル法律": ("mimotohosho", "昭和八年法律第四十二号", "昭和八年法律第四十二号（身元保証ニ関スル法律）"),
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


def parse_article(art: ET.Element, title: str | None = None) -> dict:
    """条（Article）。前文（Preamble）・条のない本則（MainProvision）も、項（Paragraph）を持つので同じに読む"""
    paragraphs = []
    for p in art.findall("Paragraph"):
        lines = [texts(p.find("ParagraphSentence"), "Sentence")]
        for item in p.findall("Item"):
            lines += item_lines(item, "ItemTitle", "ItemSentence")
        # 号が表（TableStruct）で書かれている条（民事訴訟法5条など）。1行ずつ、空でない列を全角空白でつなぐ（T039）
        for ts in p.findall("TableStruct"):
            for row in ts.iter("TableRow"):
                cols = [texts(c, "Sentence").strip("　 ") for c in row.findall("TableColumn")]
                if any(cols):
                    lines.append("　".join(c for c in cols if c))
        paragraphs.append({"num": p.get("Num"), "text": "\n".join(lines)})
    return article_record(title or art.findtext("ArticleTitle"), art.findtext("ArticleCaption"), paragraphs)


def parse_appendix(at: ET.Element, name: str) -> dict:
    """別表（AppdxTable）。号の並び・表を1行ずつにし、1つの項（"1"）として持つ"""
    lines = []
    for item in at.findall("Item"):
        lines += item_lines(item, "ItemTitle", "ItemSentence")
    for row in at.iter("TableRow"):
        cols = [texts(c, "Sentence").strip("　 ") for c in row.findall("TableColumn")]
        if any(cols):
            lines.append("　".join(c for c in cols if c))
    related = (at.findtext("RelatedArticleNum") or "").strip() or None
    return article_record(name, related, [{"num": "1", "text": "\n".join(lines)}])


def article_record(title: str | None, caption: str | None, paragraphs: list[dict]) -> dict:
    body = "\n".join(p["text"] for p in paragraphs)
    return {
        "title": title,
        "caption": caption,
        "paragraphs": paragraphs,
        "text": body,
        "text_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    }


def build_toc(root: ET.Element) -> dict[str, list[str]]:
    """条番号 → その条がある編・章・節などの見出し（上から順に。「第三編　債権」の形）。前文は ["前文"]"""
    toc: dict[str, list[str]] = {}

    def walk(el: ET.Element, path: list[str]) -> None:
        for child in el:
            if child.tag in TOC_LEVELS:
                walk(child, path + [(child.findtext(TOC_LEVELS[child.tag]) or "").strip()])
            elif child.tag == "Article" and child.get("Num"):
                toc.setdefault(child.get("Num"), path)

    main = root.find(".//LawBody/MainProvision")
    if main is not None:
        walk(main, [])
    if root.find(".//LawBody/Preamble") is not None:
        toc["前文"] = ["前文"]
    return toc


def fetch_toc(law: str) -> dict:
    """目次だけを取得して保存する（条の本文のファイルは触らない。本文を取り直すと取得日・改正の取り込みが変わるため）"""
    law_num = LAWS[law][1]
    url = f"https://laws.e-gov.go.jp/api/1/lawdata/{urllib.parse.quote(law_num)}"
    with urllib.request.urlopen(url, timeout=120) as r:
        xml = r.read()
    root = ET.fromstring(xml)
    if root.findtext("Result/Code") != "0":
        raise ValueError(f"e-Gov API がエラー：{root.findtext('Result/Message')}")
    rec = {"law": law, "law_num": law_num, "url": url, "fetched_at": datetime.date.today().isoformat(), "toc": build_toc(root)}
    TOC.mkdir(parents=True, exist_ok=True)
    (TOC / f"{LAWS[law][0]}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return rec


def load_toc(law: str) -> dict[str, list[str]] | None:
    p = TOC / f"{LAWS[law][0]}.json" if law in LAWS else None
    return json.loads(p.read_text(encoding="utf-8"))["toc"] if p and p.exists() else None


def law_path(law: str):
    return STATUTES / f"{LAWS[law][0]}.json"


def fetch_law(law: str) -> dict:
    law_num = LAWS[law][1]
    egov_title = LAWS[law][2] if len(LAWS[law]) > 2 else law
    url = f"https://laws.e-gov.go.jp/api/1/lawdata/{urllib.parse.quote(law_num)}"
    with urllib.request.urlopen(url, timeout=120) as r:
        xml = r.read()
    root = ET.fromstring(xml)
    if root.findtext("Result/Code") != "0":
        raise ValueError(f"e-Gov API がエラー：{root.findtext('Result/Message')}")
    title = (root.findtext(".//LawBody/LawTitle") or "").strip()
    if title != egov_title:
        raise ValueError(f"法令番号 {law_num} の法令名が「{title}」で、「{egov_title}」と一致しない")
    main = root.find(".//LawBody/MainProvision")
    articles = {}
    for art in main.iter("Article"):
        num = art.get("Num")
        if num in articles:
            raise ValueError(f"条番号が重複：{num}")
        articles[num] = parse_article(art)
    # 条に分かれていない法令（失火ノ責任ニ関スル法律など）：本則の項を「本則」として持つ
    if not articles and main.findall("Paragraph"):
        articles["本則"] = parse_article(main, title="本則")
    # 前文（日本国憲法など）・別表（通信傍受法の対象犯罪など）も、条と同じ形で「前文」「別表第一」として持つ
    pre = root.find(".//LawBody/Preamble")
    if pre is not None:
        articles["前文"] = parse_article(pre, title="前文")
    for at in root.findall(".//LawBody/AppdxTable"):
        name = (at.findtext("AppdxTableTitle") or "").strip().split("（")[0]
        if name and name not in articles:
            articles[name] = parse_appendix(at, name)
    # 附則：改正法の附則（AmendLawNum のあるもの）は含めない。制定時の附則のうち、本則と条番号が重ならない条だけ含める
    # （手形法の附則 82条「署名には記名捺印を含む」のように、本則に続く番号で中身の規定を置く法令がある。T039）
    for sp in root.findall(".//LawBody/SupplProvision"):
        if sp.get("AmendLawNum"):
            continue
        for art in sp.iter("Article"):
            num = art.get("Num")
            if num and num not in articles:
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


def show_asof(law: str, asof: str, articles: list[str]) -> None:
    """出題時点の本文（T013）。本文が変わっていない条は「現行と同じ」と出す"""
    path = STATUTES / "changes" / f"{LAWS[law][0]}-{asof}.json"
    if not path.exists():
        sys.exit(f"🔴 {path.relative_to(STATUTES.parent.parent)} がない（python3 pipeline/revisions.py {law} {asof} --with-old-text で作る）")
    rec = json.loads(path.read_text(encoding="utf-8"))
    if "removed_text" not in rec:
        sys.exit(f"🔴 {path.name} に出題時点の本文がない（--with-old-text で作り直す）")
    print(f"⚠ {law} の {asof} 時点の本文（e-Gov の過去の版）。読むだけで、解説に引用しない（引用は現行の本文から）")
    for art in articles:
        if art in rec["changed"]:
            print(f"■ {art}条（{asof} 時点。出題後に本文が変わった）\n   " + rec["changed"][art]["old_text"].replace("\n", "\n   "))
        elif art in rec["removed_text"]:
            print(f"■ {art}条（{asof} 時点。今はない）\n   " + rec["removed_text"][art].replace("\n", "\n   "))
        elif art in rec["added"]:
            print(f"■ {art}条：{asof} 時点にはなかった（出題後に増えた条）")
        elif art in load_law(law)["articles"]:
            print(f"■ {art}条：{asof} 時点から本文は変わっていない（現行の本文と同じ）")
        else:
            print(f"🔴 {law} に条番号 {art} がない（枝番は 98_2 の形）")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", nargs="+", choices=sorted(LAWS), metavar="法令", help="法令全体を取得して保存")
    ap.add_argument("--fetch-all", action="store_true")
    ap.add_argument("--fetch-toc", nargs="+", choices=sorted(LAWS), metavar="法令", help="目次だけを取得して保存（T016）")
    ap.add_argument("law", nargs="?", choices=sorted(LAWS))
    ap.add_argument("articles", nargs="*")
    ap.add_argument("--asof", help="出題時点の本文を表示する（data/statutes/changes/<保存名>-<日付>.json。引用には使わない）")
    args = ap.parse_args()

    targets = sorted(LAWS) if args.fetch_all else (args.fetch or [])
    for law in targets:
        try:
            rec = fetch_law(law)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"🔴 {law}：{e}")
        print(f"✅ {law}（{rec['law_num']}）：{rec['article_count']}条を保存（{rec['fetched_at']}）")

    for law in args.fetch_toc or []:
        try:
            rec = fetch_toc(law)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"🔴 {law}：{e}")
        print(f"✅ {law}：目次を保存（{len(rec['toc'])}条・{rec['fetched_at']}）")

    if args.law and args.asof:
        show_asof(args.law, args.asof, args.articles)
    elif args.law:
        rec = load_law(args.law)
        for art in args.articles:
            a = rec["articles"].get(art)
            if a is None:
                sys.exit(f"🔴 {args.law} に条番号 {art} がない（枝番は 98_2 の形）")
            print(f"✅ {args.law} {a['title']}{a['caption'] or ''}（{rec['fetched_at']} 取得）")
            print("   " + a["text"].replace("\n", "\n   "))


if __name__ == "__main__":
    main()
