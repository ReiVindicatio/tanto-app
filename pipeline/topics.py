"""肢の分野（T016）。解説が最初に引いている条文が、その法令の目次のどこにあるかで決める（決定的。AI の分類も他社の分類も使わない）。

- 民法・刑法・会社法など編のある法令は「編 › 章」、編のない法令（憲法）は「章」
- 商法の科目は法令名を前に付ける（会社法・商法・手形法・小切手法）。行政法の科目は法令ごと
- 条文を引いていない肢（判例・学説だけで説明する肢）は「その他（条文を引いていない肢）」
目次は data/statutes/toc/（`python3 pipeline/egov.py --fetch-toc <法令>`）。
"""
from __future__ import annotations

import re

from egov import load_toc

# 科目 → 分野の元にする法令（先頭から順に、解説の citations で最初に出てきたもの）。None はどの法令でもよい（法令ごと）
SUBJECT_LAWS: dict[str, list[str] | None] = {
    "minpo": ["民法"],
    "keiho": ["刑法"],
    "keiso": ["刑事訴訟法"],
    "kenpo": ["日本国憲法"],
    "minso": ["民事訴訟法"],
    "shoho": ["会社法", "商法", "手形法", "小切手法"],
    "gyosei": None,
}
# 法令名を分野名の前に付ける科目（複数の法令にまたがる科目）
PREFIX_LAW = {"shoho"}
OTHER = "その他（条文を引いていない肢）"
OUTSIDE = "附則・別表など"


def heading(path: list[str]) -> list[str]:
    """目次の見出しのうち、編と章まで（「第三編　債権」「第二章　契約」）。全角空白は半角にそろえる"""
    out = []
    for h in path:
        out.append(h.replace("　", " "))
        if re.match(r"^第[^編章]+章", h):
            break
    return out


class Tocs:
    """法令ごとの目次（条番号 → 編・章の見出し、見出し → 目次の中の順番）を一度だけ読む"""

    def __init__(self, toc_of=load_toc):
        self.toc_of = toc_of
        self.cache: dict[str, tuple[dict[str, list[str]], dict[tuple, int]]] = {}

    def get(self, law: str) -> tuple[dict[str, list[str]], dict[tuple, int]]:
        if law not in self.cache:
            heads = {n: heading(p) for n, p in (self.toc_of(law) or {}).items()}
            order: dict[tuple, int] = {}
            for h in heads.values():
                order.setdefault(tuple(h), len(order))
            self.cache[law] = (heads, order)
        return self.cache[law]


def topic_of(subject: str, explanation: dict | None, tocs: Tocs) -> tuple[str, tuple]:
    """(分野名, 並べ順のキー)。並べ順は法令の順 → 目次の順"""
    laws = SUBJECT_LAWS[subject]
    for c in (explanation or {}).get("citations", []):
        if c.get("type") != "statute" or (laws is not None and c["law"] not in laws):
            continue
        law_rank = laws.index(c["law"]) if laws else 0
        if laws is None:
            return c["law"], (0, c["law"])
        heads, order = tocs.get(c["law"])
        prefix = f"{c['law']} " if subject in PREFIX_LAW else ""
        if c["article"] not in heads:
            return f"{prefix}{OUTSIDE}", (law_rank, 10**6, "")
        path = heads[c["article"]]
        return prefix + (" › ".join(path) if path else c["law"]), (law_rank, order[tuple(path)], "")
    return OTHER, (10**6, 0, "")
