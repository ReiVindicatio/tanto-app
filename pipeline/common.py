"""パイプライン共通の定数と小道具。"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
EXTRACTED = ROOT / "data" / "extracted"
PARSED = ROOT / "data" / "parsed"
REPORTS = ROOT / "reports" / "validation"
MANIFEST = ROOT / "sources" / "manifest.json"
ERRATA = ROOT / "data" / "review" / "errata.json"

EXAM_IDS = {"予備試験": "yobi", "司法試験": "shiho"}
SUBJECT_IDS = {
    "憲法": "kenpo", "行政法": "gyosei",
    "民法": "minpo", "商法": "shoho", "民事訴訟法": "minso",
    "刑法": "keiho", "刑事訴訟法": "keiso",
    "一般教養科目": "kyoyo",
}
GROUP_IDS = {
    "憲法行政法": "kenpo-gyosei",
    "民法商法民事訴訟法": "minji",
    "刑法刑事訴訟法": "keiji",
    "一般教養科目": "kyoyo",
}


def year_parts(year_dir: str) -> tuple[str, int]:
    """'R08-2026' → ('R08', 2026)"""
    era, western = year_dir.split("-")
    return era, int(western)


def nfkc(s: str) -> str:
    return unicodedata.normalize("NFKC", s)


def to_int(s: str) -> int:
    return int(nfkc(s))


def manifest_entry(rel_path: str) -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for e in manifest["files"]:
        if e["path"] == rel_path:
            return e
    raise SystemExit(f"manifest にない：{rel_path}")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


PAGE_NUMBER_RE = re.compile(r"^\s*-\s*[0-9０-９]+\s*-\s*$")


def errata_record(exam_id: str, year: int) -> dict | None:
    """data/review/errata.json の、その試験・年度の確認記録（T006）。なければ None"""
    if not ERRATA.exists():
        return None
    doc = json.loads(ERRATA.read_text(encoding="utf-8"))
    return doc.get("exams", {}).get(exam_id, {}).get(str(year))


def errata_for_question(exam_id: str, year: int, subject_name: str, number: int) -> list[dict]:
    """その問に当たる訂正・採点上の取扱い（findings）の一覧"""
    rec = errata_record(exam_id, year) or {}
    return [f for f in rec.get("findings", []) if f.get("subject") == subject_name and f.get("number") == number]
