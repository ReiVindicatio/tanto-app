"""解説の連続生成の1バッチの後始末を、1つのコマンドで行う（T039。prompts/explain-runbook.md）。

人が見ていない間に回すので、メインのセッションは複合コマンドを使わず、このコマンドだけを実行する（許可の設定は単独のコマンドにしか当たらない）。
  1. --skip で渡した問を data/review/explain_skips.json に足す
  2. pipeline/regen.py（解説の検査の書き戻し・書き出し）
  3. NOW.md の「解説の生成」の行を上書きする
  4. git add・commit・push（解説・skips・法令・書き出し・NOW.md だけ）
  5. 次の9問を表示する

使い方：
  python3 pipeline/explain_commit.py
  python3 pipeline/explain_commit.py --skip yobi-2026-keiso-q14 "刑事訴訟規則で決まる（e-Gov にない）"
  python3 pipeline/explain_commit.py --no-push      # commit まで（確認用）
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import subprocess
import sys

from common import ROOT
from explain_queue import queue

SKIPS = ROOT / "data" / "review" / "explain_skips.json"
NOW = ROOT / "NOW.md"
INDEX = ROOT / "app" / "public" / "data" / "index.json"
PATHS = ["data/explanations", "data/review", "data/statutes", "pipeline/egov.py", "app/public/data", "NOW.md",
         "prompts/explain-runbook.md", "pipeline/explain_commit.py"]
CO_AUTHOR = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"


def run(*args: str, check: bool = True) -> str:
    r = subprocess.run(list(args), cwd=ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"🔴 {' '.join(args)} が失敗\n{r.stdout}{r.stderr}")
    return r.stdout


def add_skips(pairs: list[list[str]]) -> None:
    if not pairs:
        return
    doc = json.loads(SKIPS.read_text(encoding="utf-8"))
    have = {s["question_id"] for s in doc["skips"]}
    today = datetime.date.today().isoformat()
    for qid, reason in pairs:
        if qid not in have:
            doc["skips"].append({"question_id": qid, "reason": reason, "at": today})
    SKIPS.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def changed_questions() -> list[str]:
    out = run("git", "status", "--porcelain", "-uall", "--", "data/explanations")  # 新しいフォルダの中のファイルも1つずつ
    qs = []
    for line in out.splitlines():
        m = re.search(r"data/explanations/(\w+)/(\d+)/(\w+)/q(\d+)\.json", line)
        if m:
            qs.append(f"{m.group(1)}-{m.group(2)}-{m.group(3)}-q{m.group(4)}")
    return sorted(qs)


def update_now() -> str:
    q = queue()
    skips = len(json.loads(SKIPS.read_text(encoding="utf-8"))["skips"])
    explained = sum(s["explanations"] for s in json.loads(INDEX.read_text(encoding="utf-8"))["sets"])
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    line = (f"- **解説の生成（T039）：`/loop` で連続生成中**（{stamp} 時点：残り {len(q)}問・肢 {sum(x[4] for x in q)}・"
            f"解説のある肢カード {explained}・飛ばした問 {skips}（`data/review/explain_skips.json`））。"
            f"手順は `prompts/explain-runbook.md`\n")
    s = NOW.read_text(encoding="utf-8")
    s = re.sub(r"- \*\*解説の生成（T039）：.*\n", line, s)
    NOW.write_text(s, encoding="utf-8")
    return line.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip", nargs=2, action="append", default=[], metavar=("QUESTION_ID", "REASON"))
    ap.add_argument("--no-push", action="store_true")
    args = ap.parse_args()

    add_skips(args.skip)
    print(run(sys.executable, str(ROOT / "pipeline" / "regen.py")).strip().splitlines()[-1])
    qs = changed_questions()
    print(update_now())
    run("git", "add", *PATHS)
    if run("git", "diff", "--cached", "--name-only").strip():
        what = f"{qs[0]}〜{qs[-1]}（{len(qs)}問）" if qs else "記録の更新"
        run("git", "commit", "-q", "-m", f"解説：{what}\n\n{CO_AUTHOR}")
        print(run("git", "log", "--oneline", "-1").strip())
        if not args.no_push:
            run("git", "push", "-q", "origin", "main")
            print("✅ push した")
    else:
        print("（commit するものなし）")
    print("次の9問：")
    for exam, year, subj, num, _ in queue()[:9]:
        print(f"  {exam} {year} {subj} {num}")


if __name__ == "__main__":
    main()
