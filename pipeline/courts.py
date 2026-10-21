"""裁判所の裁判例検索（courts.go.jp）で判例を探し、判決のページの項目を表示する（T041・決定022）。

解説の判例は、この道具で判決のページ（hanrei/<id>/detail2）を確かめたものだけを載せる。
WebSearch の結果（解説サイト・予備校の要約）は素材にしない。

使い方：
  python3 pipeline/courts.py search 留置権 引換給付                     # 最高裁判例を検索（1語目を含み、さらに2語目以降もすべて含むもの。新しい順に30件）
  python3 pipeline/courts.py search 留置権 --date 1972-11-16           # 裁判年月日で絞る（昭和47-11-16 の形も可）
  python3 pipeline/courts.py search 留置権 --from 昭和40 --to 昭和50   # 期間で絞る（西暦の年でも可）
  python3 pipeline/courts.py search 名誉毀損 --all --page 2            # 最高裁以外も含める・次の30件
  python3 pipeline/courts.py show 52639                                # 判決のページの項目（判示事項・裁判要旨など）
  python3 pipeline/courts.py pdf 52639                                 # 判決全文の PDF を保存して、保存先を表示（Read の道具で読む）

- 取ってきたページは .cache/courts/ に置き、同じものを二度取らない。取得の間は1秒あける
- データベースにあるのは昭和以降（大審院の判決はないとみられる）
- 全文検索のヒットが2000件を超えると、日付で絞っていても結果が出ない（サイトの仕様）。そのときはエラーを表示するので、語を足す
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import html
import re
import sys
import time
import urllib.parse
import urllib.request

from common import ROOT

BASE = "https://www.courts.go.jp/hanrei"
CACHE = ROOT / ".cache" / "courts"
USER_AGENT = "tanto-app-casecheck/1.0 (+https://github.com/ReiVindicatio/tanto-app)"
INTERVAL = 1.0
GENGO = [("令和", datetime.date(2019, 5, 1)), ("平成", datetime.date(1989, 1, 8)), ("昭和", datetime.date(1926, 12, 25))]
DETAIL_FIELDS = ["事件番号", "事件名", "裁判年月日", "法廷名", "裁判所名", "裁判種別", "結果", "判例集等巻・号・頁",
                 "原審裁判所名", "原審事件番号", "原審裁判年月日", "判示事項", "裁判要旨", "参照法条"]

_last_fetch = 0.0


def detail_url(case_id: str, kind: int = 2) -> str:
    return f"{BASE}/{case_id}/detail{kind}/index.html"


def pdf_url(case_id: str) -> str:
    return f"https://www.courts.go.jp/assets/hanrei/hanrei-pdf-{case_id}.pdf"


def fetch(url: str, binary: bool = False) -> bytes:
    global _last_fetch
    CACHE.mkdir(parents=True, exist_ok=True)
    key = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:24] + (".pdf" if binary else ".html"))
    if key.exists():
        return key.read_bytes()
    wait = INTERVAL - (time.monotonic() - _last_fetch)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    _last_fetch = time.monotonic()
    key.write_bytes(data)
    return data


def to_wareki(d: datetime.date) -> tuple[str, int]:
    for name, start in GENGO:
        if d >= start:
            return name, d.year - start.year + 1
    raise ValueError(f"昭和より前の日付は検索できない：{d}")


def parse_date(s: str) -> tuple[str, int, int, int]:
    """'1972-11-16'・'昭和47-11-16'・'昭和47年11月16日' → ('昭和', 47, 11, 16)"""
    s = s.strip().replace("元年", "1年")
    m = re.fullmatch(r"(令和|平成|昭和)(\d+)(?:-|年)(\d+)(?:-|月)(\d+)日?", s)
    if m:
        return m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
    if re.fullmatch(r"(大正|明治).*", s):
        raise ValueError(f"昭和より前の日付は検索できない（大審院の判決はデータベースにない）：{s}")
    d = datetime.date.fromisoformat(s)
    g, y = to_wareki(d)
    return g, y, d.month, d.day


def parse_year(s: str, end: bool) -> tuple[str, int, int, int]:
    """'昭和40' または '1965' → 年の初日（end なら末日）"""
    m = re.fullmatch(r"(令和|平成|昭和)(\d+)", s)
    if m:
        return m.group(1), int(m.group(2)), 12 if end else 1, 31 if end else 1
    y = int(s)
    d = datetime.date(y, 12, 31) if end else datetime.date(y, 1, 1)
    g, wy = to_wareki(d)
    return g, wy, d.month, d.day


def search_url(words: list[str], date: str | None = None, start: str | None = None, end: str | None = None,
               all_courts: bool = False, page: int = 1) -> str:
    # query1 はスペース区切りの「どれかを含む」（OR）。2語目以降は query2（「さらにこの語を含む」）に入れて絞る
    params: list[tuple[str, str]] = [("query1", words[0])]
    if len(words) > 1:
        params.append(("query2", " ".join(words[1:])))
    if not all_courts:
        params += [("filter[division][]", "1"), ("filter[division][]", "2")]  # 最高裁判例の民事（1）と刑事（2）
    lo = hi = None
    if date:
        lo = hi = parse_date(date)
    if start:
        lo = parse_year(start, end=False)
    if end:
        hi = parse_year(end, end=True)
    if lo or hi:
        params.append(("filter[judgeDateMode]", "2"))
    for side, v in (("From", lo), ("To", hi)):
        if v:
            g, y, mo, d = v
            params += [(f"filter[judgeGengo{side}]", g), (f"filter[judgeYear{side}]", str(y)),
                       (f"filter[judgeMonth{side}]", str(mo)), (f"filter[judgeDay{side}]", str(d))]
    if page > 1:
        params.append(("offset", str((page - 1) * 30)))
    return f"{BASE}/search2/index.html?" + urllib.parse.urlencode(params)


def _lines(fragment: str) -> list[str]:
    t = re.sub(r"<br\s*/?>", "\n", fragment)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    return [x.strip() for x in t.split("\n") if x.strip()]


class SearchError(Exception):
    pass


def parse_search(page: str) -> tuple[int, list[dict]]:
    """検索結果のページ → (件数, 結果の一覧)。サイトがエラーを返したら SearchError（2000件を超えた、など）"""
    err = re.search(r'<ul class="errorMessage">(.*?)</ul>', page, re.S)
    if err:
        raise SearchError(" ".join(_lines(err.group(1))))
    m = re.search(r"(\d+)件中", page)
    total = int(m.group(1)) if m else 0
    table = re.search(r'<table class="[^"]*search-result-table[^"]*">(.*?)</table>', page, re.S)
    out = []
    for row in re.findall(r"<tr>(.*?)</tr>", table.group(1) if table else "", re.S):
        a = re.search(r'href="\./\.\./(\d+)/detail(\d)/index\.html"[^>]*>([^<]*)</a>', row)
        if not a:
            continue
        ps = [_lines(p) for p in re.findall(r"<p>(.*?)</p>", row, re.S)]
        first = ps[0] if ps else []
        second = ps[1] if len(ps) > 1 else []
        out.append({
            "id": a.group(1),
            "kind": a.group(3).strip(),
            "case_number": first[0] if first else "",
            "case_name": " ".join(first[1:]),
            "date": second[0] if second else "",
            "court": second[1] if len(second) > 1 else "",
            "rest": " ".join(second[2:]),
            "url": detail_url(a.group(1), int(a.group(2))),
        })
    return total, out


def parse_detail(page: str) -> dict[str, str]:
    """判決のページ → 項目名→中身"""
    page = re.sub(r"<script.*?</script>", "", page, flags=re.S)
    lines = _lines(page)
    out: dict[str, str] = {}
    for i, line in enumerate(lines):
        if line in DETAIL_FIELDS and line not in out:
            body = []
            for nxt in lines[i + 1:]:
                if nxt in DETAIL_FIELDS or nxt in ("全文", "ページ上部に戻る"):
                    break
                body.append(nxt)
            out[line] = "\n".join(body)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("words", nargs="+")
    s.add_argument("--date")
    s.add_argument("--from", dest="start")
    s.add_argument("--to", dest="end")
    s.add_argument("--all", action="store_true", help="最高裁以外の裁判例も含める")
    s.add_argument("--page", type=int, default=1)
    d = sub.add_parser("show")
    d.add_argument("id")
    p = sub.add_parser("pdf")
    p.add_argument("id")
    args = ap.parse_args()

    try:
        if args.cmd == "search":
            url = search_url(args.words, args.date, args.start, args.end, args.all, args.page)
            total, rows = parse_search(fetch(url).decode("utf-8", "replace"))
            print(f"{total}件（{(args.page - 1) * 30 + 1}件目から）  検索：{url}")
            for r in rows:
                print(f"- [{r['id']}] {r['date']} {r['court']} {r['case_number']} {r['case_name']}（{r['kind']}）")
            if rows:
                print("中身は python3 pipeline/courts.py show <id> で見る")
            if total > args.page * 30:
                print(f"（続きは --page {args.page + 1}）")
        elif args.cmd == "show":
            url = detail_url(args.id)
            fields = parse_detail(fetch(url).decode("utf-8", "replace"))
            if not fields:
                sys.exit(f"判決のページが読めない：{url}")
            print(f"確認に使う URL：{url}")
            for k in DETAIL_FIELDS:
                if fields.get(k):
                    print(f"【{k}】{fields[k]}")
            print(f"【全文 PDF】{pdf_url(args.id)}（python3 pipeline/courts.py pdf {args.id} で保存）")
        else:
            data = fetch(pdf_url(args.id), binary=True)
            if not data.startswith(b"%PDF"):
                sys.exit(f"PDF でないものが返った：{pdf_url(args.id)}")
            path = CACHE / f"hanrei-{args.id}.pdf"
            path.write_bytes(data)
            print(f"保存した：{path}（Read の道具で開く。出典の URL は {pdf_url(args.id)}）")
    except (urllib.error.URLError, TimeoutError) as e:
        sys.exit(f"取得できない：{e}")
    except SearchError as e:
        sys.exit(f"検索できなかった（サイトのエラー）：{e}\n→ 語を足して絞る（2語目以降は「すべて含む」で絞り込む。日付だけでは絞れない：全文検索の件数が先に2000件を超えると結果が出ない）")
    except ValueError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
