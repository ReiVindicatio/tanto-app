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
  python3 pipeline/explain_commit.py --skip-recheck yobi-2026-minpo-q02 "判決と公式の○×が合わない（肢e）"
  python3 pipeline/explain_commit.py --no-push      # commit まで（確認用）
  python3 pipeline/explain_commit.py --recheck      # 今のバッチを判例の確かめ直し（T041）として扱う（ふつうは .claude/current_batch.json の記録に従う）
  python3 pipeline/explain_commit.py --next-only    # commit せず、次のバッチを決めて表示するだけ

次のバッチは、判例の確かめ直しの ①（第三者サイトの判例）が残っている間は確かめ直し、それ以後は解説の生成と確かめ直しを
交互に出し、どちらも空になったら問の解説（T018）を出す。.claude/current_batch.json に書く（pipeline/batch_status.py が進み具合を見る）。
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import subprocess
import sys

from common import ROOT
from explain_queue import question_queue, queue
import case_queue

SKIPS = ROOT / "data" / "review" / "explain_skips.json"
RECHECK_SKIPS = ROOT / "data" / "review" / "recheck_skips.json"
NOW = ROOT / "NOW.md"
INDEX = ROOT / "app" / "public" / "data" / "index.json"
PATHS = ["data/explanations", "data/review", "data/statutes", "pipeline", "app/public/data", "NOW.md",
         "prompts", ".claude/agents", "tickets", ".gitignore"]
RECHECK_LINE = "- **判例の確かめ直し（T041）"
QUESTION_LINE = "- **問の解説（T018）"
BATCH = ROOT / ".claude" / "current_batch.json"  # 次のバッチ（git には入れない）
BATCH_SIZE = 18
CO_AUTHOR = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"


def run(*args: str, check: bool = True) -> str:
    r = subprocess.run(list(args), cwd=ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"🔴 {' '.join(args)} が失敗\n{r.stdout}{r.stderr}")
    return r.stdout


def add_skips(pairs: list[list[str]], path=SKIPS) -> None:
    if not pairs:
        return
    doc = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"skips": []}
    have = {s["question_id"] for s in doc["skips"]}
    today = datetime.date.today().isoformat()
    for qid, reason in pairs:
        if qid not in have:
            doc["skips"].append({"question_id": qid, "reason": reason, "at": today})
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


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
    state = "`/loop` で連続生成中" if q else "完了"
    line = (f"- **解説の生成（T039）：{state}**（{stamp} 時点：残り {len(q)}問・肢 {sum(x[4] for x in q)}・"
            f"解説のある肢カード {explained}・飛ばした問 {skips}（`data/review/explain_skips.json`））。"
            f"手順は `prompts/explain-runbook.md`\n")
    s = NOW.read_text(encoding="utf-8")
    s = re.sub(r"- \*\*解説の生成（T039）：.*\n", line, s)
    s = re.sub(r"  - 🔴 公式の○×と食い違った解説.*\n", "", s)
    if mm := mismatches():  # 禁止事項2：食い違いは公開から外し、NOW.md に残す
        s = s.replace(line, line + f"  - 🔴 公式の○×と食い違った解説（公開から外した。法改正かパースの誤りの信号）：{'、'.join(mm)}\n")
    if (cq := case_queue.queue()) or RECHECK_LINE in s:
        first = sum(1 for x in cq if x[0] == 1)
        rline = (f"{RECHECK_LINE}**（{stamp} 時点：残り {len(cq)}問（① 第三者サイトの判例 {first}問・② 要確認 {len(cq) - first}問）。"
                 f"手順は `prompts/explain-runbook.md` の「判例の確かめ直し」）\n")
        if RECHECK_LINE in s:
            s = re.sub(re.escape(RECHECK_LINE) + r".*\n", lambda _: rline, s)
        else:
            s = s.replace(line, line + rline)
    if (qq := question_queue()) or QUESTION_LINE in s:
        made = sum(1 for p in (ROOT / "data" / "explanations").rglob("q*.json")
                   if json.loads(p.read_text(encoding="utf-8")).get("question_explanation"))
        qline = (f"{QUESTION_LINE}：{'`/loop` で連続生成中' if qq else '完了'}**（{stamp} 時点：残り {len(qq)}問・問の解説 {made}問。"
                 f"指示は `prompts/explain-question-v1.md`）\n")
        if QUESTION_LINE in s:
            s = re.sub(re.escape(QUESTION_LINE) + r"：.*\n", lambda _: qline, s, count=1)
        else:
            s = re.sub(r"(- \*\*解説の生成（T039）：.*\n)", lambda m: m.group(1) + qline, s, count=1)
    NOW.write_text(s, encoding="utf-8")
    return line.strip()


def mismatches() -> list[str]:
    out = []
    for p in sorted((ROOT / "data" / "explanations").rglob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        for e in d.get("explanations", []):
            if any("食い違う" in f for f in e.get("check", {}).get("failures", [])):
                out.append(e["target"]["id"])
        qe = d.get("question_explanation")
        if qe and any("食い違う" in f for f in qe.get("check", {}).get("failures", [])):
            out.append(f"{d['question_id']}（問の解説）")
    return out


WINDOW = ROOT / ".claude" / "explain_window.json"  # 利用上限の5時間枠の目安（git には入れない）
WINDOW_HOURS = 5
CAP_PER_WINDOW = 12  # 1バッチ（6本・18問）で約4%と測ったが（2026-10-20）、12バッチ目で上限に届いたとみられ止まった。余裕を見て12


def count_window(start_end: str | None, start_used: int | None) -> None:
    """この5時間枠で何バッチ目かを数え、上限の目安に達したら、いつまで待つかを表示する"""
    now = datetime.datetime.now()
    st = json.loads(WINDOW.read_text(encoding="utf-8")) if WINDOW.exists() else None
    if start_end:  # 枠を手で合わせる（/usage の「○時間○分後にリセット」と使用率から）
        st = {"end": start_end, "batches": 0, "cap": max(0, (90 - (start_used or 0)) // 4 - 2)}
    if st is None or now >= datetime.datetime.fromisoformat(st["end"]):
        st = {"end": (now + datetime.timedelta(hours=WINDOW_HOURS)).isoformat(timespec="minutes"), "batches": 0, "cap": CAP_PER_WINDOW}
    if not start_end:
        st["batches"] += 1
    WINDOW.write_text(json.dumps(st, ensure_ascii=False) + "\n", encoding="utf-8")
    end = datetime.datetime.fromisoformat(st["end"])
    print(f"利用上限の目安：この枠 {st['batches']}/{st['cap']} バッチ（枠のリセット {end:%H:%M}）")
    if st["batches"] >= st["cap"]:
        print(f"⏸ 上限の目安に達した：{end + datetime.timedelta(minutes=5):%H:%M} まで待ってから次のバッチへ")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip", nargs=2, action="append", default=[], metavar=("QUESTION_ID", "REASON"))
    ap.add_argument("--skip-recheck", nargs=2, action="append", default=[], metavar=("QUESTION_ID", "REASON"),
                    help="判例の確かめ直しのキューから外す（判決と公式の○×が合わない、など）")
    ap.add_argument("--no-push", action="store_true")
    ap.add_argument("--recheck", action="store_true", help="判例の確かめ直し（T041）のバッチ")
    ap.add_argument("--next-only", action="store_true", help="commit せず、次のバッチを決めて表示するだけ")
    ap.add_argument("--window", nargs=2, metavar=("RESET_AT", "USED_PERCENT"),
                    help="5時間枠を合わせるだけ（例 2026-10-20T14:41 18）。commit はしない")
    args = ap.parse_args()

    if args.window:
        count_window(args.window[0], int(args.window[1]))
        return
    if args.next_only:
        next_batch("explain")
        return
    cur = json.loads(BATCH.read_text(encoding="utf-8")) if BATCH.exists() else {}
    mode = "recheck" if args.recheck else cur.get("mode", "explain")
    add_skips(args.skip)
    add_skips(args.skip_recheck, RECHECK_SKIPS)
    print(run(sys.executable, str(ROOT / "pipeline" / "regen.py")).strip().splitlines()[-1])
    qs = changed_questions()
    print(update_now())
    run("git", "add", *PATHS)
    if run("git", "diff", "--cached", "--name-only").strip():
        what = f"{qs[0]}〜{qs[-1]}（{len(qs)}問）" if qs else "記録の更新"
        title = {"recheck": "判例の確かめ直し", "question": "問の解説"}.get(mode, "解説")
        run("git", "commit", "-q", "-m", f"{title}：{what}\n\n{CO_AUTHOR}")
        print(run("git", "log", "--oneline", "-1").strip())
        if not args.no_push:
            run("git", "push", "-q", "origin", "main")
            print("✅ push した")
    else:
        print("（commit するものなし）")
    count_window(None, None)
    next_batch(mode)


def next_batch(prev: str) -> None:
    cq = case_queue.queue()
    eq = queue()
    if any(x[0] == 1 for x in cq):
        mode = "recheck"
    elif cq and eq:
        mode = "recheck" if prev == "explain" else "explain"
    elif cq or eq:
        mode = "recheck" if cq else "explain"
    else:
        mode = "question"  # 肢の解説と確かめ直しが済んだら、問の解説（T018）
    qq = question_queue() if mode == "question" else []
    qs = ([list(x[1:5]) for x in cq] if mode == "recheck" else [list(x[:4]) for x in eq] if mode == "explain"
          else [list(x[:4]) for x in qq])
    qs = qs[:BATCH_SIZE]
    BATCH.write_text(json.dumps({"mode": mode, "questions": qs, "written_at": datetime.datetime.now().isoformat(timespec="seconds")},
                                ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not qs:
        print("🏁 解説の生成・判例の確かめ直し・問の解説のキューがどれも空")
        return
    agent = {"recheck": "case-rechecker", "question": "explain-question-writer"}.get(mode, "explain-writer")
    kind = {"recheck": "判例の確かめ直し", "question": "問の解説"}.get(mode, "解説の生成")
    print(f"次のバッチ：{kind}（サブエージェント {agent}）{len(qs)}問：")
    for exam, year, subj, num in qs:
        print(f"  {exam} {year} {subj} {num}")


if __name__ == "__main__":
    main()
