"""解説の判例の verified_urls（courts.go.jp の判決のページ）が、cases に書いた判決を本当に指しているかを機械的に突き合わせる（T041）。

判決のページの「裁判年月日」と cases の date を比べ、合わないもの・読めないものを data/review/case_audit.json に書く。
（2026-10-21：courts.go.jp の URL でも別の判決のページを載せていた例が見つかったため）

使い方：
  python3 pipeline/case_audit.py      # 全部の解説を調べる（取得は1秒に1件。取ったページは .cache/courts/ に残る）
"""
from __future__ import annotations

import datetime
import json
import re

import courts
from common import ROOT
from check_explanations import EXPLANATIONS

OUT = ROOT / "data" / "review" / "case_audit.json"
ERA = {"令和": 2018, "平成": 1988, "昭和": 1925}


def iso(s: str) -> str | None:
    s = s.strip().replace("元年", "1年")
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(令和|平成|昭和)(\d+)年(\d+)月(\d+)日", s)
    if m:
        return f"{ERA[m.group(1)] + int(m.group(2)):04d}-{int(m.group(3)):02d}-{int(m.group(4)):02d}"
    return None


def main() -> None:
    rows = []
    checked = 0
    for path in sorted(EXPLANATIONS.glob("*/*/*/q*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for e in doc["explanations"]:
            for c in e.get("cases", []):
                for u in c.get("verified_urls", []):
                    m = re.search(r"courts\.go\.jp/hanrei/(\d+)/detail\d", u) or re.search(r"hanrei-pdf-(\d+)\.pdf", u)
                    if "courts.go.jp/app/files/" in u:
                        rows.append({"statement": e["target"]["id"], "url": u, "problem": "旧形式の URL（今は開けない。判決のページの URL に替える）"})
                        continue
                    if not m:
                        continue
                    checked += 1
                    u = courts.detail_url(m.group(1))  # 全文 PDF の URL は、同じ番号の判決のページで突き合わせる
                    want = iso(c.get("date", ""))
                    try:
                        fields = courts.parse_detail(courts.fetch(u).decode("utf-8", "replace"))
                    except Exception as ex:  # noqa: BLE001
                        rows.append({"statement": e["target"]["id"], "url": u, "problem": f"読めない：{ex}"})
                        continue
                    got = iso(fields.get("裁判年月日", ""))
                    if not got:
                        rows.append({"statement": e["target"]["id"], "url": u, "problem": "判決のページに裁判年月日がない"})
                    elif want != got:
                        rows.append({"statement": e["target"]["id"], "url": u, "problem": "日付が合わない",
                                     "cases_date": c.get("date"), "page_date": fields.get("裁判年月日"),
                                     "page_case": f"{fields.get('事件番号', '')} {fields.get('事件名', '')}"})
    OUT.write_text(json.dumps({"checked_at": datetime.date.today().isoformat(), "checked": checked, "problems": rows},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"調べた URL {checked}件・合わない／読めない {len(rows)}件 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
