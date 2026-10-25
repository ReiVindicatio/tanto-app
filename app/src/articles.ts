// 条文から逆引き（T060）：条 → その条を解説が引いた肢カード（articles.json）と、法令ごとの条の全文（articles/<法令の ID>.json）。
// 解説が引いた条文から数えたもの（AI 生成の解説に基づく。公式の分類ではない）
import { cardIdOf } from "./learning";

export type ArticleIndex = {
  laws: Record<string, { id: string | null; articles: Record<string, string>; captions?: Record<string, string> }>;
};
export type ArticleText = { title: string | null; caption: string | null; paragraphs: { num: string; text: string }[] };
export type LawTexts = { law: string; fetched_at: string; source: string; articles: Record<string, ArticleText> };

let indexLoading: Promise<ArticleIndex> | null = null;
const lawLoading = new Map<string, Promise<LawTexts>>();

export function loadArticleIndex(): Promise<ArticleIndex> {
  indexLoading ??= fetch(`${import.meta.env.BASE_URL}data/articles.json`)
    .then((r) => r.json() as Promise<ArticleIndex>)
    .catch((e) => {
      indexLoading = null;
      throw e;
    });
  return indexLoading;
}

export function loadLawTexts(id: string): Promise<LawTexts> {
  let p = lawLoading.get(id);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/articles/${id}.json`).then((r) => r.json() as Promise<LawTexts>);
    p.catch(() => lawLoading.delete(id));
    lawLoading.set(id, p);
  }
  return p;
}

/** 条の番号の表示：「94_2」→「94条の2」。前文・別表などはそのまま */
export function articleLabel(a: string): string {
  if (!/^\d/.test(a)) return a;
  const [main, ...subs] = a.split("_");
  return `${main}条${subs.map((x) => `の${x}`).join("")}`;
}

/** 入力した条の番号を、データの形（「94_2」）にする。「94」「94条」「第94条」「94の2」「94-2」「94条の2」を読む。読めなければ null */
export function parseArticleInput(s: string): string | null {
  const t = s.normalize("NFKC").replace(/\s/g, "").replace(/^第/, "").replace(/条/g, "");
  const m = t.match(/^(\d+)((?:[のノ_\-‐ー]\d+)*)$/);
  if (!m) return null;
  const subs = m[2].split(/[のノ_\-‐ー]/).filter(Boolean);
  return [m[1], ...subs].join("_");
}

const subjectOf = (id: string) => id.match(/-\d{4}-([a-z]+)-q/)?.[1] ?? "";
const setOf = (id: string) => id.replace(/-q\d+.*$/, "");

export function articleCards(index: ArticleIndex, law: string, article: string): string[] {
  const s = index.laws[law]?.articles[article];
  return s ? s.split(" ") : [];
}

export type ArticleCount = { law: string; article: string; count: number };

/** 科目のよく出る条文：その科目の肢（絞り込みの年度 setIds の分）を引いた数の多い順 */
export function topArticles(index: ArticleIndex, subject: string, setIds: Set<string>): ArticleCount[] {
  const out: ArticleCount[] = [];
  for (const [law, v] of Object.entries(index.laws)) {
    for (const [article, ids] of Object.entries(v.articles)) {
      const count = ids.split(" ").filter((id) => subjectOf(id) === subject && setIds.has(setOf(id))).length;
      if (count > 0) out.push({ law, article, count });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

/** 科目の肢が引いている法令（多い順）。条の番号で探すときの選択肢 */
export function lawsOfSubject(index: ArticleIndex, subject: string, setIds: Set<string>): string[] {
  const n = new Map<string, number>();
  for (const a of topArticles(index, subject, setIds)) n.set(a.law, (n.get(a.law) ?? 0) + a.count);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([law]) => law);
}

/** その条を引いた肢の、試験・年度ごとの数（新しい年度から） */
export function yearsOf(ids: string[]): { exam: string; year: number; count: number }[] {
  const m = new Map<string, number>();
  for (const id of ids) {
    const [exam, year] = id.split("-");
    m.set(`${exam}-${year}`, (m.get(`${exam}-${year}`) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([k, count]) => ({ exam: k.split("-")[0], year: Number(k.split("-")[1]), count }))
    .sort((a, b) => b.year - a.year || a.exam.localeCompare(b.exam));
}

/** 前回まちがえた肢の数 */
export function wrongCount(ids: string[], history: Map<string, { last: boolean }>): number {
  return ids.filter((id) => history.get(cardIdOf(id))?.last === false).length;
}
