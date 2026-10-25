"""段階7：正本 data/questions/ を app/public/data/ に書き出す（決定的）。

検証（validate.py）が ✅ のものだけを書き出す。✅ でないものは飛ばして一覧に出す。
解説は、書き出す時点で check_explanations の検査を通った肢のものだけを含める。
出力：
  app/public/data/index.json                  … 書き出した束の一覧と、名寄せの対応表（aliases：出典の肢 ID → カード ID）
  app/public/data/<exam>-<year>-<subject>.json … 正本と同じ形（名寄せした肢に card・same_as を足す）
  app/public/data/topics.json                 … 分野ごとの肢カード（T016）
  app/public/data/twins.json                  … よく似ているのに○×が逆の肢カードの組（T050）
  app/public/data/exams.json                  … 模試（T028）の試験時間・合格点・平均点・得点別人員（data/exams/short_answer.json から）

名寄せ（決定018）：同じ科目で、本文が同じ（全角半角・空白・句読点をならす）で、出題時点の○×も同じ肢を
1枚のカードにまとめる。前提文が要る肢は、前提文とリード文も同じときだけ。カード ID は予備（同じ試験なら古い年度）の肢 ID。

使い方：
  python3 pipeline/export.py
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import unicodedata

from check_explanations import EXPLANATIONS, check_question
from common import EXAM_IDS, GROUP_IDS, ROOT, SUBJECT_IDS
from topics import OTHER, Tocs, topic_of
from twins import display_text, find_pairs

QUESTIONS = ROOT / "data" / "questions"
EXAMS = ROOT / "data" / "exams" / "short_answer.json"
FLAGS = ROOT / "data" / "review" / "flags.json"
OUT = ROOT / "app" / "public" / "data"

EXAM_NAMES = {v: k for k, v in EXAM_IDS.items()}
SUBJECT_NAMES = {v: k for k, v in SUBJECT_IDS.items()}
# 科目 → 科目群（予備は科目群で1ファイル）
SUBJECT_GROUP = {"kenpo": "憲法行政法", "gyosei": "憲法行政法", "minpo": "民法商法民事訴訟法", "shoho": "民法商法民事訴訟法",
                 "minso": "民法商法民事訴訟法", "keiho": "刑法刑事訴訟法", "keiso": "刑法刑事訴訟法"}
SHIHO_EARLY_GROUP = {"kenpo": "公法系科目", "gyosei": "公法系科目", "minpo": "民事系科目", "shoho": "民事系科目",
                     "minso": "民事系科目", "keiho": "刑事系科目", "keiso": "刑事系科目"}
assert set(SUBJECT_GROUP.values()) | set(SHIHO_EARLY_GROUP.values()) <= set(GROUP_IDS)


def validated(doc: dict) -> bool:
    exam, subj = doc["exam"], doc["subject"]
    year_dir = f"{exam['era']}-{exam['year']}"
    group = SUBJECT_GROUP[subj]
    if exam["type"] == "shiho":  # 司法：H27 以降は科目ごと、H23〜H26 は科目系ごとのファイル
        group = SUBJECT_NAMES[subj] if exam["year"] >= 2015 else SHIHO_EARLY_GROUP[subj]
    r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "validate.py"), year_dir, group,
                        SUBJECT_NAMES[subj], "--exam", EXAM_NAMES[exam["type"]]], capture_output=True, text=True)
    return r.returncode == 0


def collect_explanations(doc: dict) -> tuple[list[dict], list[str], list[dict]]:
    """検査を通った解説（肢ごと）と、通らなかった肢・問の ID と、検査を通った問の解説（T018）を返す。"""
    exam, subj = doc["exam"], doc["subject"]
    out, held, questions = [], [], []
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
        qe = edoc.get("question_explanation")
        if qe is not None:
            if failures[edoc["question_id"]]:
                held.append(edoc["question_id"])
            else:
                questions.append({
                    "id": f"qexp-{edoc['question_id']}",
                    "question_id": edoc["question_id"],
                    "version": qe["version"],
                    "answer": qe["stated_answer"],
                    "conclusion": qe["conclusion"],
                    "body": qe["body"],
                    "citations": qe["citations"],
                    "cases": [{k: c[k] for k in ("name", "court", "date", "holding")} for c in qe.get("cases", [])],
                    "prompt_version": qe["prompt_version"],
                    "generated_at": qe["generated_at"],
                    "model": qe["generated_by"]["model"],
                })
    for sid in held:
        print(f"⏭️  解説 {sid}：検査に通らないので書き出さない")
    return out, held, questions


EXAM_ORDER = {"yobi": 0, "shiho": 1}
EXAM_SHORT = {"yobi": "予備", "shiho": "司法"}


def dedup_key_text(t: str) -> str:
    return re.sub(r"[\s、，。．,.]", "", unicodedata.normalize("NFKC", t))


ANSWER_SLOTS = re.compile(r"[（(]解答欄は[^）)]*[）)]")  # 「（解答欄は、アからオの順に［No.32］から［No.36］）」。試験ごとに番号が違う（T042）


SLOT_MARK = re.compile(r"[［\[]\s*(?:№|No\.?|Ｎｏ．?)\s*[0-9０-９]+\s*[］\]]")  # 肢の本文の末尾の「[№11]」。試験ごとに番号が違う（T042）


def dedup_statement(text: str) -> str:
    """肢の本文（解答欄の番号は除く）"""
    return dedup_key_text(SLOT_MARK.sub("", text))


def dedup_context(q: dict) -> str:
    """前提文が要る肢を比べるときのリード文＋前提文（解答欄の番号は除く）"""
    return dedup_key_text(ANSWER_SLOTS.sub("", q["stem"]) + "".join(c["text"] for c in q["context"]))


def dedup(docs: list[dict]) -> tuple[dict[str, str], list[str]]:
    """名寄せ：出典の肢 ID → カード ID（カードの代表でない肢だけ）と、○×が食い違ってまとめなかった組の一覧。
    各肢に card（代表の ID。自分が代表なら付けない）と same_as（まとめた他の出典）を書き込む"""
    groups: dict[tuple, list[tuple[dict, dict, dict]]] = {}
    for doc in docs:
        qs = {q["id"]: q for q in doc["questions"]}
        for st in doc["statements"]:
            if not st["truth_at_exam"]:
                continue
            q = qs[st["question_id"]]
            ctx = dedup_context(q) if st["requires_context"] else ""
            groups.setdefault((doc["subject"], dedup_statement(st["text"]), ctx), []).append((doc, q, st))
    aliases, conflicts = {}, []
    for members in groups.values():
        if len(members) < 2:
            continue
        if len({m[2]["truth_at_exam"]["value"] for m in members}) > 1:
            conflicts.append("・".join(m[2]["id"] for m in members))
            continue
        flagged = [m[2] for m in members if "review_flag" in m[2]]
        if flagged:
            # 同じ文・同じ○×の肢は、法改正などの影響も同じ。フラグのない肢にも引き継いで肢カードから外す（T004）
            for doc, q, st in members:
                if "review_flag" not in st:
                    st["review_flag"] = flagged[0]["review_flag"]
                    print(f"⚠️  {flagged[0]['id']} のフラグを、同じ文の {st['id']} に引き継いだ（data/review/flags.json にも足す）")
            continue
        members.sort(key=lambda m: (EXAM_ORDER[m[0]["exam"]["type"]], m[0]["exam"]["year"], m[2]["id"]))
        card = members[0][2]["id"]
        for doc, q, st in members:
            if st["id"] != card:
                st["card"] = card
                aliases[st["id"]] = card
            st["same_as"] = [{"id": o["id"], "exam": EXAM_SHORT[d["exam"]["type"]], "era": d["exam"]["era"],
                              "year": d["exam"]["year"], "number": oq["number"], "label": o["label"]}
                             for d, oq, o in members if o["id"] != st["id"]]
    return aliases, conflicts


def topics(docs: list[dict]) -> dict:
    """分野（T016）：科目ごとに、分野名と、その分野の肢カードの ID（空白でつなぐ）。並びは法令・目次の順（行政法は肢の多い順）"""
    tocs = Tocs()
    by_subject: dict[str, dict[str, dict]] = {}
    for doc in docs:
        exp = {e["statement_id"]: e for e in doc["explanations"]}
        for st in doc["statements"]:
            if not st["truth_at_exam"] or "review_flag" in st:
                continue
            label, key = topic_of(doc["subject"], exp.get(st["id"]), tocs)
            t = by_subject.setdefault(doc["subject"], {}).setdefault(label, {"label": label, "key": key, "ids": []})
            t["ids"].append(st["id"])
    out = {}
    for subject, ts in by_subject.items():
        if subject == "gyosei":
            order = sorted(ts.values(), key=lambda t: (t["label"] == OTHER, -len(t["ids"]), t["label"]))
        else:
            order = sorted(ts.values(), key=lambda t: t["key"])
        out[subject] = [{"label": t["label"], "cards": " ".join(t["ids"])} for t in order]
    return out


def twins(docs: list[dict]) -> dict:
    """よく似た肢（T050）：組と、組に出てくる肢カードの本文・○×・出典（答え合わせの後に、別の年度の束を読まずに出せるように）"""
    cards, info = [], {}
    for doc in docs:
        qs = {q["id"]: q for q in doc["questions"]}
        for st in doc["statements"]:
            if not st["truth_at_exam"] or "review_flag" in st or "card" in st or st["requires_context"]:
                continue
            q = qs[st["question_id"]]
            sub = f" 小問{q['sub_questions'][st['sub']]['marker']}" if st.get("sub") is not None else ""
            text = display_text(st["text"])
            cards.append({"id": st["id"], "subject": doc["subject"], "text": text, "truth": st["truth_at_exam"]["value"]})
            # ids：このカードにまとめた出典の肢（名寄せ）。アプリは、絞り込みに入っている年度の肢を選んで出す
            info[st["id"]] = {"text": text, "truth": st["truth_at_exam"]["value"],
                              "src": f"{EXAM_SHORT[doc['exam']['type']]} {doc['exam']['era']} 第{q['number']}問{sub} 肢{st['label']}",
                              "ids": [st["id"]] + [o["id"] for o in st.get("same_as", [])]}
    pairs = find_pairs(cards)
    for p in pairs:
        if info[p["a"]]["truth"] is not True or info[p["b"]]["truth"] is not False:
            raise SystemExit(f"よく似た肢の組の○×が逆になっていない：{p['a']}・{p['b']}")
    used = sorted({p[k] for p in pairs for k in ("a", "b")})
    return {"note": "同じ科目で、文がよく似ているのに出題時点の○×が逆の肢カードの組（T050）。a が○、b が×。ad・bd は違う部分の文字の範囲",
            "pairs": pairs, "cards": {i: info[i] for i in used}}


def exams() -> dict:
    """模試（T028）の材料をアプリの形にする。得点別人員は 0 点からの人数の並びにする（読み込みを小さく）"""
    src = json.loads(EXAMS.read_text(encoding="utf-8"))
    results = {}
    for key, r in src["results"].items():
        out = {"pass_total": r["pass_total"], "total_full": r["total"]["full"], "scored": r["scored"],
               "subjects": {s: {"full": v["full"], "avg": v["avg"]} for s, v in r["subjects"].items()}}
        if "min_line_rate" in r:
            out["min_line_rate"] = r["min_line_rate"]
        if r.get("distribution"):
            out["distribution"] = {s: [d[str(k)] for k in range(len(d))] for s, d in r["distribution"].items()}
        results[key] = out
    return {
        "note": "出典：法務省ウェブサイト「司法試験予備試験の結果について」「司法試験の結果について」（短答式試験の結果）・各受験案内。"
                "このアプリが PDF から読み取ったもの（pipeline/exam_info.py）",
        "times": {e: {"year": t["year"], "minutes": t["minutes"]} for e, t in src["times"].items()},
        "results": results,
        "unreadable": sorted(src.get("unreadable", {})),
    }


def card_list(doc: dict, name: str) -> str:
    """出題できる肢カードの ID（束の ID を除いた「q11-e」の形）を空白でつないだもの（T038）。
    アプリは起動時に index.json だけ読み、枚数・回答済みの数・今日の○問の選び出しに使う。問の ID は「束の ID-q11」"""
    out = []
    for s in doc["statements"]:
        if not s["truth_at_exam"] or "review_flag" in s:
            continue
        suffix = s["id"].removeprefix(name + "-")
        m = re.match(r"q\d+", suffix)
        if suffix == s["id"] or not m or s["question_id"] != f"{name}-{m.group(0)}" or " " in suffix:
            raise SystemExit(f"肢カードの ID から問の ID を作れない：{s['id']}（{s['question_id']}）")
        out.append(suffix)
    return " ".join(out)


def share_explanations(docs: list[dict]) -> int:
    """名寄せした肢のどれかに解説があれば、他の出典の肢にも付ける（○×が同じなので結論も同じ）"""
    by_id = {e["statement_id"]: e for doc in docs for e in doc["explanations"]}
    added = 0
    for doc in docs:
        have = {e["statement_id"] for e in doc["explanations"]}
        for st in doc["statements"]:
            if st["id"] in have or not st.get("same_as"):
                continue
            src = next((by_id[o["id"]] for o in st["same_as"] if o["id"] in by_id), None)
            if src:
                doc["explanations"].append({**src, "id": f"exp-{st['id']}", "statement_id": st["id"], "shared_from": src["statement_id"]})
                added += 1
    return added


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    docs, skipped = [], []
    # 人の確認待ちの肢（アプリは肢カードから外す）。truth_at_exam は変えない
    flags = json.loads(FLAGS.read_text(encoding="utf-8"))["flags"] if FLAGS.exists() else []
    open_flags = {f["statement_id"]: {"kind": f["kind"], "reason": f["reason"]} for f in flags if f["status"] == "open"}
    for path in sorted(QUESTIONS.glob("*/*/*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        name = f"{doc['exam']['type']}-{doc['exam']['year']}-{doc['subject']}"
        if not validated(doc):
            skipped.append(name)
            continue
        doc["explanations"], _, doc["question_explanations"] = collect_explanations(doc)
        for st in doc["statements"]:
            if st["id"] in open_flags:
                st["review_flag"] = open_flags[st["id"]]
        docs.append(doc)
    aliases, conflicts = dedup(docs)
    shared = share_explanations(docs)
    sets = []
    for doc in docs:
        name = f"{doc['exam']['type']}-{doc['exam']['year']}-{doc['subject']}"
        (OUT / f"{name}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        sets.append({
            "id": name,
            "file": f"{name}.json",
            "exam": doc["exam"],
            "exam_name": EXAM_NAMES[doc["exam"]["type"]],
            "subject": doc["subject"],
            "subject_name": SUBJECT_NAMES[doc["subject"]],
            "questions": len(doc["questions"]),
            "statement_cards": sum(1 for s in doc["statements"] if s["truth_at_exam"] and "review_flag" not in s),
            "cards": card_list(doc, name),
            "explanations": len(doc["explanations"]),
            "question_explanations": len(doc["question_explanations"]),
            "attribution": doc["attribution"],
        })
    # 分野の一覧（T016）。科目の画面で分野を開いたときだけ読む（起動時の index.json には入れない）
    topic_doc = {"note": "分野は、解説が最初に引いている条文の、e-Gov の目次での編・章（T016）。条文を引いていない肢は「その他」",
                 "subjects": topics(docs)}
    (OUT / "topics.json").write_text(json.dumps(topic_doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 模試（T028）の材料
    (OUT / "exams.json").write_text(json.dumps(exams(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    twin_doc = twins(docs)
    (OUT / "twins.json").write_text(json.dumps(twin_doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    index = {"sets": sets, "aliases": dict(sorted(aliases.items()))}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for s in sets:
        print(f"✅ {s['id']}：{s['questions']}問・肢カード {s['statement_cards']}・解説 {s['explanations']}")
    print(f"名寄せ：{len(aliases)}肢を他の肢と同じカードに（解説の共有 {shared}）")
    print(f"よく似た肢：{len(twin_doc['pairs'])}組・{len(twin_doc['cards'])}枚")
    for c in conflicts:
        print(f"⚠️  本文が同じで○×が食い違うのでまとめない：{c}")
    for name in skipped:
        print(f"⏭️  {name}：検証が ✅ でないので書き出さない")


if __name__ == "__main__":
    main()
