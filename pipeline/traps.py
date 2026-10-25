"""ひっかけの型（T059）：×の肢に型を付ける作業の準備と取りまとめ。

  python3 pipeline/traps.py --prepare DIR   # 型を付けていない×の肢を、100肢ずつの入力（DIR/batch_NN.jsonl）にする
  python3 pipeline/traps.py --merge DIR     # DIR/out_NN.jsonl を検査して data/traps/traps.json に足す
  python3 pipeline/traps.py --merge-scope DIR  # 「範囲・射程」の向き（DIR/out_NN.jsonl。prompts/trap-scope-split-v2.md）を scope_dir に足す

- 型を付けるのはサブエージェント（指示は prompts/trap-types-v2.md）。材料は肢・解説・引いた条文だけで、公式の○×は変えない
- 対象：名寄せの代表の肢カードで、公式の○×が×、肢カードから外していない、前提文の要らない、解説のあるもの
- data/traps/traps.json：{肢 ID: {type, second, basis（正しい内容の出どころ：statute・case・theory・other）, why, prompt_version, generated_at, model}}。問題データとは別に持つ
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from common import ROOT

DATA = ROOT / "app" / "public" / "data"
OUT = ROOT / "data" / "traps" / "traps.json"
PROMPT = "trap-types-v2"
MODEL = "claude-opus-5-5"
TYPES = {"exception", "add_requirement", "drop_requirement", "existence", "transplant", "subject_swap", "scope", "degree",
         "effect_nature", "number_order", "case_reverse", "case_reasoning", "theory", "other"}
BASES = {"statute", "case", "theory", "other"}
BATCH = 100


def targets() -> dict[str, dict]:
    idx = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    aliases = set(idx["aliases"])
    out = {}
    for info in idx["sets"]:
        d = json.loads((DATA / info["file"]).read_text(encoding="utf-8"))
        exp = {e["statement_id"]: e for e in d["explanations"]}
        stems = {q["id"]: q["stem"] for q in d["questions"]}
        for s in d["statements"]:
            t = s.get("truth_at_exam")
            if (not t or t["value"] is not False or s.get("review_flag") or s["id"] in aliases
                    or s.get("requires_context") or s["id"] not in exp):
                continue
            e = exp[s["id"]]
            out[s["id"]] = {"id": s["id"], "subject": d["subject"], "stem": stems.get(s["question_id"], ""), "text": s["text"], "conclusion": e["conclusion"], "body": e["body"],
                            "quotes": [f"{c['law']}{c['article']}条: {c['quote']}" for c in e["citations"] if c.get("quote")][:3]}
    return out


def load() -> dict:
    return json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}


def prepare(d: Path) -> None:
    done = load()
    todo = [x for k, x in sorted(targets().items()) if k not in done]
    d.mkdir(parents=True, exist_ok=True)
    for n in range(0, len(todo), BATCH):
        with open(d / f"batch_{n // BATCH:02d}.jsonl", "w", encoding="utf-8") as f:
            for x in todo[n:n + BATCH]:
                f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"型を付ける×の肢 {len(todo)}（{-(-len(todo) // BATCH)}まとまり）→ {d}")


def merge(d: Path) -> None:
    tg = targets()
    done = load()
    errs, added = [], 0
    for p in sorted(d.glob("out_*.jsonl")):
        src = p.name.replace("out_", "batch_")
        want = [json.loads(l)["id"] for l in open(d / src, encoding="utf-8")] if (d / src).exists() else None
        rows = [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]
        if want is not None and [r["id"] for r in rows] != want:
            errs.append(f"{p.name}：入力と肢の並びが合わない（{len(rows)}/{len(want)}）")
            continue
        for r in rows:
            if r["id"] not in tg:
                errs.append(f"{p.name}：{r['id']} は対象の×の肢ではない")
            elif r.get("type") not in TYPES or (r.get("second") is not None and r["second"] not in TYPES):
                errs.append(f"{p.name}：{r['id']} の型が一覧にない（{r.get('type')}・{r.get('second')}）")
            elif r.get("basis") not in BASES:
                errs.append(f"{p.name}：{r['id']} の出どころ（basis）が一覧にない（{r.get('basis')}）")
            elif not r.get("why") or len(r["why"]) > 40:
                errs.append(f"{p.name}：{r['id']} の理由が空か長すぎる")
            else:
                if r["id"] not in done:
                    added += 1
                done[r["id"]] = {"type": r["type"], "second": r.get("second"), "basis": r["basis"], "why": r["why"],
                                 "prompt_version": PROMPT, "generated_at": date.today().isoformat(), "model": MODEL}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(sorted(done.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    for e in errs[:30]:
        print(f"❌ {e}")
    print(f"{'⚠️' if errs else '✅'} data/traps/traps.json：{len(done)}肢（今回足した {added}・残り {len(set(tg) - set(done))}）")


def merge_scope(d: Path) -> None:
    done = load()
    errs, n = [], 0
    for p in sorted(d.glob("out_*.jsonl")):
        for r in (json.loads(l) for l in open(p, encoding="utf-8") if l.strip()):
            v = done.get(r["id"])
            if not v or v["type"] != "scope":
                errs.append(f"{p.name}：{r['id']} は型が scope の肢ではない")
            elif r.get("dir") not in ("wide", "narrow", "mixed") or not r.get("why"):
                errs.append(f"{p.name}：{r['id']} の向きか理由がない")
            else:
                v["scope_dir"], v["scope_why"], v["scope_prompt"] = r["dir"], r["why"], "trap-scope-split-v2"
                n += 1
    left = [k for k, v in done.items() if v["type"] == "scope" and "scope_dir" not in v]
    OUT.write_text(json.dumps(dict(sorted(done.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    for e in errs[:30]:
        print(f"❌ {e}")
    print(f"{'⚠️' if errs or left else '✅'} 範囲・射程の向き：{n}肢（残り {len(left)}）")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prepare", type=Path)
    ap.add_argument("--merge", type=Path)
    ap.add_argument("--merge-scope", type=Path)
    a = ap.parse_args()
    if a.prepare:
        prepare(a.prepare)
    if a.merge:
        merge(a.merge)
    if a.merge_scope:
        merge_scope(a.merge_scope)


if __name__ == "__main__":
    sys.exit(main())
