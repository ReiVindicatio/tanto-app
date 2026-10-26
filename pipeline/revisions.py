"""出題時点の条文（e-Gov 法令 API v2 の asof）と、保存済みの現行の条文（data/statutes/）を条ごとに比べ、
出題後に本文が変わった条の一覧を data/statutes/changes/<保存名>-<日付>.json に書く（T004・T012）。

解説を作る年度に合わせて流し、解説の生成時に「この肢の条文は出題後に変わったか」を確かめる材料にする。
AI の判断は使わない（本文の文字列の比較だけ）。v2 で取れるのは 2016年10月以降の版だけ。

使い方：
  python3 pipeline/revisions.py 民法 2023-07-01      # 2023-07-01 時点の版と比べる
  python3 pipeline/revisions.py 民法 2023-07-01 --show 772   # 変わった条の新旧の本文を表示
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET

from egov import LAWS, STATUTES, load_law, parse_article

CHANGES = STATUTES / "changes"
# e-Gov の法令 ID（v2 の URL に使う）
LAW_IDS = {
    "民法": "129AC0000000089",
    "刑法": "140AC0000000045",
    "会社法": "417AC0000000086",
    "民事訴訟法": "408AC0000000109",
    "刑事訴訟法": "323AC0000000131",
    "日本国憲法": "321CONSTITUTION",
    "商法": "132AC0000000048",
    "借地借家法": "403AC0000000090",
}


def fetch_asof(law: str, asof: str) -> tuple[str, bytes, dict[str, dict]]:
    url = f"https://laws.e-gov.go.jp/api/2/law_data/{LAW_IDS[law]}?asof={asof}&response_format=xml"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        xml = r.read()
    root = ET.fromstring(xml)
    title = (root.findtext(".//revision_info/law_title") or "").strip()
    if title != law:
        raise ValueError(f"法令 ID {LAW_IDS[law]} の法令名が「{title}」で、「{law}」と一致しない")
    main = root.find(".//LawBody/MainProvision")
    articles = {art.get("Num"): parse_article(art) for art in main.iter("Article")}
    return url, xml, articles


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("law")
    ap.add_argument("asof", help="出題時点の日付（YYYY-MM-DD）")
    ap.add_argument("--show", nargs="*", default=[], help="新旧の本文を表示する条（枝番は 98_2）")
    ap.add_argument("--with-old-text", action="store_true",
                    help="変わった条・消えた条の出題時点の本文も書く（T013：解説を書くときに読む。引用には使わない）")
    args = ap.parse_args()
    if args.law not in LAW_IDS or args.law not in LAWS:
        sys.exit(f"🔴 未対応の法令：{args.law}")

    current = load_law(args.law)
    url, xml, old = fetch_asof(args.law, args.asof)
    cur = current["articles"]
    changed = sorted((n for n in old if n in cur and old[n]["text_sha256"] != cur[n]["text_sha256"]), key=article_key)
    added = sorted((n for n in cur if n not in old), key=article_key)
    removed = sorted((n for n in old if n not in cur), key=article_key)

    out = CHANGES / f"{LAWS[args.law][0]}-{args.asof}.json"
    CHANGES.mkdir(parents=True, exist_ok=True)
    rec = {
        "law": args.law,
        "asof": args.asof,
        "asof_source": {"url": url, "xml_sha256": hashlib.sha256(xml).hexdigest(),
                        "fetched_at": datetime.date.today().isoformat()},
        "current_fetched_at": current["fetched_at"],
        "note": "出題時点（asof）の版と、保存済みの現行の版で、本文が変わった条。本文の文字列の比較だけで、改正の中身は判断していない",
        "changed": {n: {"title": cur[n]["title"], "old_sha256": old[n]["text_sha256"], "new_sha256": cur[n]["text_sha256"],
                        **({"old_text": old[n]["text"]} if args.with_old_text else {})}
                    for n in changed},
        "added": added,
        "removed": removed,
    }
    if args.with_old_text:
        rec["removed_text"] = {n: old[n]["text"] for n in removed}
        rec["note"] += "。old_text・removed_text は出題時点の本文（e-Gov の過去の版）。解説で読むだけで、引用には使わない（引用は現行の本文から）"
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{args.law}：{args.asof} 時点から本文が変わった条 {len(changed)}・増えた条 {len(added)}・消えた条 {len(removed)} → {out.relative_to(STATUTES.parent.parent)}")
    print("変わった条：", " ".join(changed))
    for n in args.show:
        print(f"\n== {n}（{args.asof} 時点）\n{old.get(n, {}).get('text', '（なし）')}\n== {n}（現行）\n{cur.get(n, {}).get('text', '（なし）')}")


def article_key(n: str) -> tuple[int, ...]:
    return tuple(int(x) if x.isdigit() else 0 for x in n.split("_"))


if __name__ == "__main__":
    main()
