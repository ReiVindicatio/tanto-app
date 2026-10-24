"""よく似た肢（T050）：同じ科目で、文がよく似ているのに出題時点の○×が逆の肢カードの組を選ぶ（決定的）。

素材は法務省の問題文と公式の○×だけ。AI の判断は入れない。
- 対象：名寄せの代表の肢カードで、○×があり、前提文の要らないもの（review_flag のあるものは呼び出す側で除く）
- 似ている度合い：difflib の ratio（autojunk なし）。全角半角・読点（，、）・「附／付」をならした文で比べる（文字数は変えない）
- 総当たりは遅い（民法で約1,700×1,700）ので、2文字ずつの並び（bigram）の重なりで候補を絞ってから比べる
- 違う部分：両方の文の、一致しない文字の範囲。漢字・カタカナ・英数字の続きの途中で切れたら、その続きの端まで広げる
  （「主体／客体」が「主／客」にならないように）。間の一致が MERGE_GAP 文字以下なら1つにまとめる（色がまだらにならないように）
"""
from __future__ import annotations

import difflib
import re
import unicodedata
from collections import Counter, defaultdict

# 2026-10-23：0.75〜0.80 の組を目で見て決めた（「文書提出命令／検証物提示命令」のような比べて覚える組が多い）
THRESHOLD = 0.75
# 文字数の差がこれより大きい組は比べない（ratio が閾値に届かないことが多く、遅いだけ）
MAX_LENGTH_GAP = 0.35
# bigram の重なり（Dice 係数）がこれ未満なら比べない。2026-10-23 に総当たりと比べて 286組中 280組が残った
MIN_DICE = 0.5
MERGE_GAP = 2

SLOT_MARK = re.compile(r"\s*[［\[]\s*(?:№|No\.?|Ｎｏ．?)\s*[0-9０-９]+\s*[］\]]")


def display_text(text: str) -> str:
    """見せる本文：末尾の解答欄の番号（［№11］）を除く。試験ごとに番号が違い、違う部分に数えないように"""
    return SLOT_MARK.sub("", text).strip()


def _norm_char(c: str) -> str:
    n = unicodedata.normalize("NFKC", c)
    n = n if len(n) == 1 else c
    # 読点のならしと、意味の変わらない表記の揺れ（附属／付属）。違う部分に数えないように
    return {",": "、", "，": "、", ".": "。", "．": "。", "附": "付"}.get(n, n)


def comparable(text: str) -> str:
    """比べるための文（文字数は display_text と同じに保つ。違う部分の範囲をそのまま使えるように）"""
    return "".join(_norm_char(c) for c in text)


def _bigrams(t: str) -> set[str]:
    return {t[i:i + 2] for i in range(len(t) - 1)}


_KIND = [re.compile(r"[\u4e00-\u9fff々〆]"), re.compile(r"[\u30a1-\u30fcｦ-ﾟ]"), re.compile(r"[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]")]


def _kind(c: str) -> int | None:
    return next((k for k, r in enumerate(_KIND) if r.match(c)), None)


def _widen(t: str, s: int, e: int) -> tuple[int, int]:
    """範囲の端が漢字・カタカナ・英数字の続きの途中なら、その続きの端まで広げる"""
    k = _kind(t[s]) if s < len(t) else None
    while k is not None and s > 0 and _kind(t[s - 1]) == k:
        s -= 1
    k = _kind(t[e - 1]) if e > 0 else None
    while k is not None and e < len(t) and _kind(t[e]) == k:
        e += 1
    return s, e


def _merge(t: str, ranges: list[list[int]]) -> list[list[int]]:
    out: list[list[int]] = []
    for s, e in ranges:
        s, e = _widen(t, s, e)
        if out and s - out[-1][1] <= MERGE_GAP:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def diff_ranges(a: str, b: str) -> tuple[list[list[int]], list[list[int]]]:
    """a と b の違う部分（[始め, 終わり) の並び）"""
    ra, rb = [], []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        if i2 > i1:
            ra.append([i1, i2])
        if j2 > j1:
            rb.append([j1, j2])
    return _merge(a, ra), _merge(b, rb)


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def find_pairs(cards: list[dict]) -> list[dict]:
    """cards：{id, subject, text（display_text 済み）, truth}。組：{a（○の肢）, b（×の肢）, sim, ad, bd}。並びは科目・似ている順・ID"""
    by_subject: dict[str, list[dict]] = defaultdict(list)
    for c in cards:
        by_subject[c["subject"]].append(c)
    pairs = []
    for subject in sorted(by_subject):
        cs = by_subject[subject]
        trues = [c for c in cs if c["truth"] is True]
        falses = [c for c in cs if c["truth"] is False]
        fnorm = [comparable(c["text"]) for c in falses]
        fbig = [_bigrams(t) for t in fnorm]
        index: dict[str, list[int]] = defaultdict(list)
        for j, bg in enumerate(fbig):
            for g in bg:
                index[g].append(j)
        for c in trues:
            t = comparable(c["text"])
            bg = _bigrams(t)
            shared: Counter[int] = Counter()
            for g in bg:
                for j in index.get(g, ()):
                    shared[j] += 1
            for j, n in shared.items():
                u = fnorm[j]
                if 2 * n < MIN_DICE * (len(bg) + len(fbig[j])) or abs(len(t) - len(u)) > len(t) * MAX_LENGTH_GAP:
                    continue
                if t == u:
                    continue  # 本文が同じで○×が逆（名寄せで食い違いとして出る）。比べる意味がない
                m = difflib.SequenceMatcher(None, t, u, autojunk=False)
                if m.real_quick_ratio() < THRESHOLD or m.quick_ratio() < THRESHOLD:
                    continue
                r = m.ratio()
                if r < THRESHOLD:
                    continue
                ad, bd = diff_ranges(t, u)
                pairs.append({"a": c["id"], "b": falses[j]["id"], "sim": round(r, 3), "ad": ad, "bd": bd, "subject": subject})
    pairs.sort(key=lambda p: (p["subject"], -p["sim"], p["a"], p["b"]))
    for p in pairs:
        del p["subject"]
    return pairs
