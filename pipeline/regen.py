"""段階2以降を、保存済みのファイル（data/extracted/・data/explanations/・data/statutes/）だけから作り直す（T001）。

作り直したあと `git diff --exit-code data/ app/public/data/ reports/` で差分がなければ、
パーサ・導出・書き出しが既存の結果を変えていないことになる（回帰テスト）。
PDF は読まない（段階1の extract.py は、新しい PDF を取り込むときだけ手元で流す）。

使い方：
  python3 pipeline/regen.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPELINE = ROOT / "pipeline"


def run(*args: str) -> None:
    r = subprocess.run([sys.executable, str(PIPELINE / args[0]), *args[1:]], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"🔴 {' '.join(args)} が失敗\n{r.stdout}{r.stderr}")


def main() -> None:
    targets = json.loads((PIPELINE / "targets.json").read_text(encoding="utf-8"))["targets"]

    groups = sorted({(t["exam"], t["year"], t["group"]) for t in targets})
    for exam, year, group in groups:
        run("parse_answers.py", year, group, "--exam", exam)
    for t in targets:
        run("parse_questions.py", t["year"], t["group"], t["subject"], "--exam", t["exam"])
        run("validate.py", t["year"], t["group"], t["subject"], "--exam", t["exam"])
        run("derive.py", t["year"], t["group"], t["subject"], "--exam", t["exam"])

    # 解説の検査（結果をファイルに書き戻す）。検査に通らない解説があっても止めない（公開しないだけ）
    for path in sorted((ROOT / "data" / "explanations").glob("*/*/*/q*.json")):
        exam, year, subject = path.parts[-4], path.parts[-3], path.parts[-2]
        subprocess.run([sys.executable, str(PIPELINE / "check_explanations.py"), exam, year, subject, path.stem[1:]],
                       capture_output=True, text=True)

    run("export.py")
    print(f"✅ 作り直した：科目群 {len(groups)}・対象 {len(targets)}")


if __name__ == "__main__":
    main()
