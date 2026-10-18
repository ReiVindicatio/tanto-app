"""段階7：正本 data/questions/ を app/public/data/ に書き出す（決定的）。

検証（validate.py）が ✅ のものだけを書き出す。✅ でないものは飛ばして一覧に出す。
解説は、書き出す時点で check_explanations の検査を通った肢のものだけを含める。
出力：
  app/public/data/index.json                  … 書き出した束の一覧
  app/public/data/<exam>-<year>-<subject>.json … 正本と同じ形

使い方：
  python3 pipeline/export.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys

from check_explanations import EXPLANATIONS, check_question
from common import EXAM_IDS, GROUP_IDS, ROOT, SUBJECT_IDS

QUESTIONS = ROOT / "data" / "questions"
OUT = ROOT / "app" / "public" / "data"

EXAM_NAMES = {v: k for k, v in EXAM_IDS.items()}
SUBJECT_NAMES = {v: k for k, v in SUBJECT_IDS.items()}
# 科目 → 科目群（予備は科目群で1ファイル）
SUBJECT_GROUP = {"kenpo": "憲法行政法", "gyosei": "憲法行政法", "minpo": "民法商法民事訴訟法", "shoho": "民法商法民事訴訟法",
                 "minso": "民法商法民事訴訟法", "keiho": "刑法刑事訴訟法", "keiso": "刑法刑事訴訟法"}
assert set(SUBJECT_GROUP.values()) <= set(GROUP_IDS)


def validated(doc: dict) -> bool:
    exam, subj = doc["exam"], doc["subject"]
    year_dir = f"{exam['era']}-{exam['year']}"
    r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "validate.py"), year_dir, SUBJECT_GROUP[subj],
                        SUBJECT_NAMES[subj], "--exam", EXAM_NAMES[exam["type"]]], capture_output=True, text=True)
    return r.returncode == 0


def collect_explanations(doc: dict) -> tuple[list[dict], list[str]]:
    """検査を通った解説（肢ごと）と、通らなかった肢の ID を返す。"""
    exam, subj = doc["exam"], doc["subject"]
    out, held = [], []
    for path in sorted((EXPLANATIONS / exam["type"] / str(exam["year"]) / subj).glob("q*.json")):
        number = int(path.stem[1:])
        edoc, failures, _ = check_question(exam["type"], exam["year"], subj, number)
        for e in edoc["explanations"]:
            sid = e["target"]["id"]
            if failures[sid]:
                held.append(sid)
                continue
            out.append({
                "id": f"exp-{sid}",
                "statement_id": sid,
                "version": e["version"],
                "conclusion": e["conclusion"],
                "body": e["body"],
                "citations": e["citations"],
                # 確認に使った URL（二次資料を含む）は画面に出さない
                "cases": [{k: c[k] for k in ("name", "court", "date", "holding")} for c in e.get("cases", [])],
                "prompt_version": edoc["prompt_version"],
                "generated_at": edoc["generated_at"],
                "model": edoc["generated_by"]["model"],
            })
    for sid in held:
        print(f"⏭️  解説 {sid}：検査に通らないので書き出さない")
    return out, held


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    sets, skipped = [], []
    for path in sorted(QUESTIONS.glob("*/*/*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        name = f"{doc['exam']['type']}-{doc['exam']['year']}-{doc['subject']}"
        if not validated(doc):
            skipped.append(name)
            continue
        doc["explanations"], _ = collect_explanations(doc)
        (OUT / f"{name}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        sets.append({
            "id": name,
            "file": f"{name}.json",
            "exam": doc["exam"],
            "exam_name": EXAM_NAMES[doc["exam"]["type"]],
            "subject": doc["subject"],
            "subject_name": SUBJECT_NAMES[doc["subject"]],
            "questions": len(doc["questions"]),
            "statement_cards": sum(1 for s in doc["statements"] if s["truth_at_exam"]),
            "explanations": len(doc["explanations"]),
            "attribution": doc["attribution"],
        })
    (OUT / "index.json").write_text(json.dumps({"sets": sets}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for s in sets:
        print(f"✅ {s['id']}：{s['questions']}問・肢カード {s['statement_cards']}・解説 {s['explanations']}")
    for name in skipped:
        print(f"⏭️  {name}：検証が ✅ でないので書き出さない")


if __name__ == "__main__":
    main()
