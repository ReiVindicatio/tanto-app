"""模試（T028）の材料：法務省の「短答式試験の結果」と受験案内から、合格点・科目ごとの満点と平均点・得点別人員・試験時間を読む。

  python3 pipeline/exam_info.py --fetch   # 法務省のサイトから PDF を取って data/raw/<試験>/資料/<年度>/ に置き、manifest に足す
  python3 pipeline/exam_info.py           # 置いた PDF を読んで data/exams/short_answer.json を書く

- 素材は法務省の公開資料だけ。PDF のテキスト層は正常なので、pdftotext の結果を規則で読む（AI の補正はしない）
- 読み取った値は検算する（科目の満点の和＝合計の満点、平均点≦満点、得点別人員の和＝採点対象者数）。読めない年度は止める
- 試験時間は受験案内の「時間割及び試験科目」から読む。法務省のサイトに残っている受験案内は R08 だけ（2026-10-24 に確認）
  なので、どの年度も R08 の時間を使い、そうと分かるように出典の年度を持たせる
- 司法試験の H23〜H26（公法系・民事系・刑事系の短答）は、試験時間の資料がないので対象にしない（H27 以降の3科目だけ）
regen.py からは呼ばない（PDF を読むので。extract.py と同じく、新しい資料を取り込むときに手元で流す）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

from common import MANIFEST, RAW, ROOT

OUT = ROOT / "data" / "exams" / "short_answer.json"
BASE = "https://www.moj.go.jp"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
# 結果の年度の一覧
RESULT_INDEX = {"予備試験": "/jinji/shihoushiken/jinji07_00027.html", "司法試験": "/jinji/shihoushiken/jinji08_00026.html"}
# 受験案内（R08。ほかの年度は法務省のサイトに残っていない）
GUIDES = {"予備試験": "/content/001457048.pdf", "司法試験": "/content/001456594.pdf"}
GUIDE_YEAR = "R08-2026"
FIRST_YEAR = {"予備試験": 2011, "司法試験": 2015}

RESULT_PDF = "短答式試験結果.pdf"
DIST_PDF = "短答式試験得点別人員調（科目別）.pdf"
GUIDE_PDF = "受験案内.pdf"

SUBJECTS = {"憲法": "kenpo", "行政法": "gyosei", "民法": "minpo", "商法": "shoho", "民事訴訟法": "minso",
            "刑法": "keiho", "刑事訴訟法": "keiso", "一般教養科目": "kyoyo"}
# 受験案内の科目の書き方 → 科目群の ID（common.GROUP_IDS と同じ）
GUIDE_GROUPS = {"民法・商法・民事訴訟法": "minji", "憲法・行政法": "kenpo-gyosei", "刑法・刑事訴訟法": "keiji", "一般教養科目": "kyoyo",
                "民法": "minpo", "憲法": "kenpo", "刑法": "keiho"}


# ---- 取得 ----

def http(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    time.sleep(0.5)  # 法務省のサイトに負荷をかけない
    return body


def links(html: str) -> list[tuple[str, str]]:
    out = []
    for href, text in re.findall(r'<a[^>]+href="([^"$]+)"[^>]*>(.*?)</a>', html, re.S):
        out.append((BASE + href if href.startswith("/") else href, re.sub(r"<[^>]+>|\s+", "", text)))
    return out


def year_dir(label: str) -> str | None:
    """「令和８年」「平成30年」「令和元年」→ 'R08-2026' など"""
    t = unicodedata.normalize("NFKC", label).replace("元", "1")
    m = re.match(r"(令和|平成)(\d+)年", t)
    if not m:
        return None
    n = int(m.group(2))
    western = (2018 + n) if m.group(1) == "令和" else (1988 + n)
    return f"{'R' if m.group(1) == '令和' else 'H'}{n:02d}-{western}"


def save(exam: str, ydir: str, name: str, url: str, manifest: dict) -> None:
    path = RAW / exam / "資料" / ydir / name
    rel = str(path.relative_to(ROOT))
    if path.exists():
        return
    body = http(url)
    if not body.startswith(b"%PDF"):
        raise SystemExit(f"PDF ではない：{url}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    manifest["files"].append({
        "path": rel, "exam": exam, "section": "資料", "year": ydir, "kind": "資料", "subject_group": None,
        "source_url": url, "fetched_at": date.today().isoformat(), "copied_from": None,
        "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
    })
    print(f"⬇️  {rel}")


def fetch() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for exam, index in RESULT_INDEX.items():
        for href, label in links(http(BASE + index).decode("utf-8", "replace")):
            ydir = year_dir(label)
            if not ydir or not re.search(r"jinji0[78]_\d+\.html", href) or int(ydir[-4:]) < FIRST_YEAR[exam]:
                continue
            page = next((h for h, x in links(http(href).decode("utf-8", "replace")) if x == "短答式試験"), None)
            if not page:
                raise SystemExit(f"{exam} {ydir}：「短答式試験」のページが見つからない（{href}）")
            pdfs = [(h, x) for h, x in links(http(page).decode("utf-8", "replace")) if h.endswith(".pdf")]
            result = next((h for h, x in pdfs if re.search(r"短答式試験結果", x)), None)
            if not result:
                raise SystemExit(f"{exam} {ydir}：短答式試験結果の PDF が見つからない（{page}）")
            save(exam, ydir, RESULT_PDF, result, manifest)
            if exam == "司法試験":
                dist = next((h for h, x in pdfs if x == "科目別得点"), None)
                if not dist:
                    raise SystemExit(f"{exam} {ydir}：科目別得点の PDF が見つからない（{page}）")
                save(exam, ydir, DIST_PDF, dist, manifest)
    for exam, path in GUIDES.items():
        save(exam, GUIDE_YEAR, GUIDE_PDF, BASE + path, manifest)
    manifest["files"].sort(key=lambda f: f["path"])
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---- 読み取り ----

def text_of(path: Path) -> str:
    t = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True).stdout
    return unicodedata.normalize("NFKC", t)


def num(s: str) -> float:
    return float(s.replace(",", ""))


def score_section(t: str) -> list[str]:
    """「短答式試験の得点」の表を、科目名・数字・「(N点満点)」の並びにする。
    年度によって、科目名と数字が同じ行のことも次の行のこともあり、科目名の字の間に空白が入る（「憲   法」）"""
    i = t.find("短答式試験の得点")
    if i < 0:
        raise ValueError("「短答式試験の得点」の表がない")
    sec = t[i + len("短答式試験の得点"):]
    j = min([k for k in (sec.find("得点別人員調"), sec.find("参考"), sec.find("参 考")) if k >= 0] or [len(sec)])
    sec = sec[:j].replace("科目別得点", " ")
    sec = re.sub(r"\((\d+)\s*点満点\)", r" <FULL\1> ", sec)
    sec = re.sub(r"(?<=[\u3040-\u9fff])[ \t\u3000]+(?=[\u3040-\u9fff])", "", sec)  # 字の間の空白をつめる（行をまたいではつめない）
    return re.findall(r"<FULL\d+>|[\u3040-\u9fff]+|\d+(?:\.\d+)?", sec)


def rows_of(tokens: list[str], names: dict[str, str]) -> dict[str, dict]:
    """名前の後の数字3つ（最高点・最低点・平均点）と、その後の満点"""
    out = {}
    for k, tok in enumerate(tokens):
        if tok not in names or names[tok] in out:
            continue
        nums, full = [], None
        for x in tokens[k + 1:]:
            if x.startswith("<FULL"):
                full = int(x[5:-1])
                break
            if x in names:
                break
            if re.fullmatch(r"\d+(?:\.\d+)?", x) and len(nums) < 3:
                nums.append(num(x))
        if full is None or len(nums) < 3:
            raise ValueError(f"{tok} の行が読めない（{nums}・満点 {full}）")
        out[names[tok]] = {"full": full, "max": nums[0], "min": nums[1], "avg": nums[2]}
    return out


def subject_rows(t: str) -> dict[str, dict]:
    return rows_of(score_section(t), SUBJECTS)


def total_row(t: str) -> dict:
    rows = rows_of(score_section(t), {"合計得点": "total"})
    if "total" not in rows:
        raise ValueError("合計得点の行が読めない")
    return rows["total"]


def scored(t: str) -> int:
    m = re.search(r"採\s*点\s*対\s*象\s*者\s*(?:数)?\s*([\d,]+)\s*人", t)
    if not m:
        raise ValueError("採点対象者数が読めない")
    return int(num(m.group(1)))


def read_yobi(path: Path) -> dict:
    t = text_of(path)
    pm = re.search(r"合計得点\s*(\d+)\s*点以上\s*\((\d+)\s*点満点\)", re.sub(r"\s+", " ", t).replace(" 点", "点"))
    if not pm:
        raise ValueError("合格点が読めない")
    return {"pass_total": int(pm.group(1)), "total": total_row(t), "subjects": subject_rows(t), "scored": scored(t)}


def read_shiho(path: Path) -> dict:
    t = text_of(path)
    flat = re.sub(r"\s+", "", t)
    pm = re.search(r"合計得点が(\d+)点以上", flat)
    lm = re.search(r"満点の(\d+)[%％]点", flat)
    if not pm or not lm:
        raise ValueError("合格に必要な成績（合計の点・最低ライン）が読めない")
    return {"pass_total": int(pm.group(1)), "min_line_rate": int(lm.group(1)) / 100, "total": total_row(t),
            "subjects": subject_rows(t), "scored": scored(t)}


def read_distribution(path: Path, fulls: dict[str, int], scored: int) -> dict[str, dict[str, int]]:
    return parse_distribution(text_of(path), fulls, scored)


def parse_distribution(text: str, fulls: dict[str, int], scored: int) -> dict[str, dict[str, int]]:
    """科目別の得点別人員調（左から憲法・民法・刑法の列）。各列は「得点 人員 累計 累計割合」。年度によって、
    人員が0の得点は人員の欄・累計の欄が空いたり、累計が採点対象者数に達したところで列が終わったりする（R06 の憲法）。
    そこで、各科目の次の得点と、人員＋前の累計＝累計になるかで、数字をどの列のものか決める"""
    order = ["kenpo", "minpo", "keiho"]
    expect = {s: fulls[s] for s in order}  # 次に来るはずの得点（満点から1点ずつ下がる）
    cum = {s: 0 for s in order}
    done = {s: False for s in order}  # 累計が採点対象者数に達した（以降は0人の行か、行がない）
    dist: dict[str, dict[str, int]] = {s: {str(k): 0 for k in range(fulls[s] + 1)} for s in order}

    for line in text.splitlines():
        if re.search(r"年|人員|得点|[(（]", line):  # 見出しの行（年度の数字が得点に紛れないように）
            continue
        line = re.sub(r"平\s*均\s*点\s*[\d.]+", " ", line)  # 終わった科目の列の平均点（民法の続きと同じ行に載る）
        toks = re.findall(r"\d[\d,]*(?:\.\d+)?%?", line)
        pct = lambda k: k < len(toks) and re.search(r"[.%]", toks[k]) is not None  # noqa: E731
        val = lambda k: int(num(toks[k]))  # noqa: E731

        def group(j: int, s: str) -> tuple[int, int]:
            """toks[j] が科目 s の得点のとき、(人員, 次の位置)"""
            later = lambda v: any(expect[x] == v for x in order[order.index(s) + 1:] if expect[x] >= 0)  # noqa: E731
            j += 1
            n = 0
            if j + 1 < len(toks) and not pct(j) and not pct(j + 1) and cum[s] + val(j) == val(j + 1):
                n, j = val(j), j + 2  # 人員 累計
            elif j < len(toks) and not pct(j) and val(j) == cum[s] and (pct(j + 1) or (j + 1 == len(toks) and not later(val(j)))):
                j += 1  # 人員の欄が空で、累計だけ（累計とほかの科目の得点が同じ数字のときは、得点と読む）
            elif j < len(toks) and not pct(j) and not later(val(j)) and (
                j + 1 == len(toks) or (not pct(j + 1) and later(val(j + 1)))
            ):
                n, j = val(j), j + 1  # 人員だけ（累計の欄が空く）
            if pct(j):
                j += 1  # 累計割合
            return n, j

        j = 0
        for s in order:
            if expect[s] < 0 or j >= len(toks) or pct(j):
                continue
            others_done = all(done[x] or expect[x] < 0 for x in order if x != s)
            if val(j) != expect[s]:
                # ほかの科目が終わったあと、0人の得点の行そのものが省かれていることがある（R03 の民法の終わり）
                if not (others_done and 0 <= val(j) < expect[s]):
                    continue  # この行にはこの科目の列がない
                expect[s] = val(j)
            n, nj = group(j, s)
            if done[s]:
                later_score = nj < len(toks) and not pct(nj) and any(
                    expect[x] == val(nj) for x in order[order.index(s) + 1:] if expect[x] >= 0)
                zero_row = n == 0 and (nj > j + 1 or nj == len(toks) or later_score)
                if not zero_row:
                    continue  # 終わった科目の得点と同じ数字の、ほかの科目の行
            j = nj
            dist[s][str(expect[s])] = n
            cum[s] += n
            expect[s] -= 1
            done[s] = cum[s] == scored
    return dist


def read_guide(path: Path) -> dict[str, int]:
    return parse_guide(text_of(path))


def parse_guide(text: str) -> dict[str, int]:
    """受験案内の短答式試験の時間割：科目群（司法は科目）→ 分。
    予備は「(1) 短答式試験」から「(2) 論文式試験」までの表だけを読む（論文式試験の時間割も同じ科目名で並ぶため）。
    司法は1つの表に論文式と短答式が並び、短答の行には「短答式試験 (民法)」と書いてある"""
    out = {}
    section = False
    for line in text.splitlines():
        m = re.search(r"\d+:\d+\s*[~～〜]\s*\d+:\d+\s*\((?:(\d+)時間)?(?:(\d+)分)?\)\s*(.+)$", line)
        if not m:
            if re.search(r"^\s*\(\d\)\s*短答式試験", line):
                section = True
            elif re.search(r"^\s*\(\d\)\s*論文式試験", line):
                section = False
            continue
        if "論文" in line or not (section or "短答" in line):
            continue
        label = re.sub(r"\s|短答式試験|[()（）]", "", m.group(3))
        if label in GUIDE_GROUPS and GUIDE_GROUPS[label] not in out:
            out[GUIDE_GROUPS[label]] = int(m.group(1) or 0) * 60 + int(m.group(2) or 0)
    return out


def check(key: str, r: dict, fulls_expected: dict[str, int]) -> list[str]:
    errs = []
    subs = r["subjects"]
    if set(subs) != set(fulls_expected):
        errs.append(f"科目がそろわない：{sorted(subs)}")
    for s, v in subs.items():
        if v["full"] != fulls_expected.get(s):
            errs.append(f"{s} の満点が {v['full']}（{fulls_expected.get(s)} のはず）")
        if not (0 <= v["min"] <= v["avg"] <= v["max"] <= v["full"]):
            errs.append(f"{s} の点が合わない：{v}")
    if sum(v["full"] for v in subs.values()) != r["total"]["full"]:
        errs.append(f"科目の満点の和 {sum(v['full'] for v in subs.values())} が合計の満点 {r['total']['full']} と合わない")
    if not (0 < r["pass_total"] <= r["total"]["full"]):
        errs.append(f"合格点 {r['pass_total']} が合計の満点の範囲にない")
    for s, d in (r.get("distribution") or {}).items():
        if sum(d.values()) != r["scored"]:
            errs.append(f"{s} の得点別人員の和 {sum(d.values())} が採点対象者数 {r['scored']} と合わない")
    return [f"{key}：{e}" for e in errs]


# テキスト層が壊れていて読めない PDF（AI や OCR で埋めない。画面ではその比較だけ出さない）
UNREADABLE = {
    "予備試験/資料/H29-2017/" + RESULT_PDF: "文字の対応表が壊れていて、pdftotext の出力が文字化けする",
    "司法試験/資料/R07-2025/" + DIST_PDF: "文字が図形として描かれていて、テキスト層がない",
}

YOBI_FULLS = {"kenpo": 30, "gyosei": 30, "minpo": 30, "shoho": 30, "minso": 30, "keiho": 30, "keiso": 30, "kyoyo": 60}
SHIHO_FULLS = {"kenpo": 50, "minpo": 75, "keiho": 50}


def build() -> dict:
    out: dict = {"note": "模試（T028）の材料。法務省の「短答式試験の結果」と受験案内から pipeline/exam_info.py で読み取った値",
                 "times": {}, "results": {}}
    errs: list[str] = []
    for exam, eid in (("予備試験", "yobi"), ("司法試験", "shiho")):
        guide = RAW / exam / "資料" / GUIDE_YEAR / GUIDE_PDF
        out["times"][eid] = {"source": str(guide.relative_to(ROOT)), "year": int(GUIDE_YEAR[-4:]), "minutes": read_guide(guide)}
        for d in sorted((RAW / exam / "資料").iterdir()):
            p = d / RESULT_PDF
            if not p.exists():
                continue
            key = f"{eid}-{d.name[-4:]}"
            rel = str(p.relative_to(RAW))
            if rel in UNREADABLE:
                out["unreadable"] = out.get("unreadable", {}) | {key: f"{rel}：{UNREADABLE[rel]}"}
                continue
            try:
                r = read_yobi(p) if eid == "yobi" else read_shiho(p)
                r["source"] = str(p.relative_to(ROOT))
                if eid == "shiho":
                    dp = d / DIST_PDF
                    drel = str(dp.relative_to(RAW))
                    if drel in UNREADABLE:
                        r["distribution"] = None
                        r["distribution_unreadable"] = f"{drel}：{UNREADABLE[drel]}"
                    else:
                        r["distribution"] = read_distribution(dp, SHIHO_FULLS, r["scored"])
                        r["distribution_source"] = str(dp.relative_to(ROOT))
            except ValueError as e:
                errs.append(f"{key}：{e}")
                continue
            errs += check(key, r, YOBI_FULLS if eid == "yobi" else SHIHO_FULLS)
            out["results"][key] = r
    want = {"yobi": {"minji", "kenpo-gyosei", "keiji"}, "shiho": {"minpo", "kenpo", "keiho"}}
    for eid, groups in want.items():
        if not groups <= set(out["times"][eid]["minutes"]):
            errs.append(f"{eid} の受験案内から試験時間が読めない：{out['times'][eid]['minutes']}")
    if errs:
        print("\n".join(f"❌ {e}" for e in errs))
        raise SystemExit(1)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="法務省のサイトから PDF を取る")
    a = ap.parse_args()
    if a.fetch:
        fetch()
    out = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"✅ {OUT.relative_to(ROOT)}：{len(out['results'])}年度分")


if __name__ == "__main__":
    sys.exit(main())
