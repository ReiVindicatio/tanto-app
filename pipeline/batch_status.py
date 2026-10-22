"""連続生成・確かめ直しのバッチの進み具合を見る（T039・T041。prompts/explain-runbook.md）。

explain_commit.py が次のバッチを .claude/current_batch.json に書く。このコマンドは、そのバッチの問のうち
済んだ問の数と、解説ファイルが最後に書かれた時刻を表示し、止まっているとみられるときは打ち切りの目安を出す。

使い方：
  python3 pipeline/batch_status.py           # 進み具合
  python3 pipeline/batch_status.py --start   # サブエージェントを起動し終えた時刻を記録する（止まりの判定の起点）
"""
from __future__ import annotations

import argparse
import datetime
import json

from common import ROOT

BATCH = ROOT / ".claude" / "current_batch.json"
EXPLANATIONS = ROOT / "data" / "explanations"
STALL_MINUTES = 25  # この間どの解説ファイルも書かれず、済んでいない問があれば、止まっているとみる


def pending(mode: str) -> set[tuple[str, int, str, int]]:
    if mode == "recheck":
        import case_queue
        return {x[1:5] for x in case_queue.queue()}
    import explain_queue
    if mode == "question":  # 問の解説（T018）
        return {x[:4] for x in explain_queue.question_queue()}
    return {x[:4] for x in explain_queue.queue()}


def main() -> None:
    if not BATCH.exists():
        print("バッチの記録がない（explain_commit.py を実行すると書かれる）")
        return
    b = json.loads(BATCH.read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", action="store_true")
    if ap.parse_args().start:
        b["started_at"] = datetime.datetime.now().isoformat(timespec="seconds")
        BATCH.write_text(json.dumps(b, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"起動の時刻を記録した：{b['started_at']}")
        return
    qs = [tuple(q) for q in b["questions"]]
    left = pending(b["mode"])
    now = datetime.datetime.now()
    last = datetime.datetime.fromisoformat(b.get("started_at") or b["written_at"])
    done = 0
    lines = []
    for exam, year, subj, num in qs:
        path = EXPLANATIONS / exam / str(year) / subj / f"q{num:02d}.json"
        mtime = datetime.datetime.fromtimestamp(path.stat().st_mtime) if path.exists() else None
        ok = (exam, year, subj, num) not in left
        done += ok
        if mtime and mtime > last:
            last = mtime
        lines.append(f"  {'✅' if ok else '…'} {exam} {year} {subj} {num}" + (f"（{mtime:%H:%M} 更新）" if mtime else ""))
    idle = int((now - last).total_seconds() // 60)
    kind = {"recheck": "確かめ直し", "question": "問の解説"}.get(b["mode"], "解説の生成")
    print(f"バッチ（{kind}）：{done}/{len(qs)} 問 済み。最後の動き {last:%H:%M}（{idle}分前）")
    print("\n".join(lines))
    if done == len(qs):
        print("→ 全部済んだ。サブエージェントの報告がそろったら explain_commit.py へ")
    elif idle >= STALL_MINUTES:
        print(f"⏰ {idle}分動きがない：戻っていないサブエージェントは TaskStop で打ち切り、explain_commit.py へ"
              "（書きかけの問はキューに残り、次のバッチで作り直される）")


if __name__ == "__main__":
    main()
