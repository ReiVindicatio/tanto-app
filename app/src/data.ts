// 問題データの読み込み（T025 で App.tsx から切り出し）
import { useEffect, useState } from "react";
import type { DataSet, SetInfo } from "./types";
import { subjectRank } from "./subjectsMeta";
import { cardIdOf, setAliases } from "./learning";

const cache = new Map<string, DataSet>();

export async function loadSet(info: SetInfo): Promise<DataSet> {
  if (!cache.has(info.file)) {
    cache.set(info.file, await fetch(`${import.meta.env.BASE_URL}data/${info.file}`).then((r) => r.json()));
  }
  return cache.get(info.file)!;
}

export function merge(sets: DataSet[]): DataSet {
  return {
    attribution: {
      ...sets[0].attribution,
      source_pdfs: [...new Set(sets.flatMap((d) => d.attribution.source_pdfs))],
    },
    exam: sets[0].exam,
    subject: sets[0].subject,
    questions: sets.flatMap((d) => d.questions),
    statements: sets.flatMap((d) => d.statements),
    explanations: sets.flatMap((d) => d.explanations),
  };
}

/** 試験の短い名前（予備・司法） */
export const EXAM_SHORT: Record<string, string> = { yobi: "予備", shiho: "司法" };
const EXAM_ORDER = ["yobi", "shiho"];

export type SubjectGroup = { subject: string; name: string; exams: string[]; sets: SetInfo[] };

/** 科目ごとにまとめる（科目は決まった順、試験は予備・司法の順、年度は新しい順） */
export function groupBySubject(sets: SetInfo[]): SubjectGroup[] {
  const m = new Map<string, SetInfo[]>();
  for (const s of sets) m.set(s.subject, [...(m.get(s.subject) ?? []), s]);
  return [...m.entries()]
    .sort(([a], [b]) => subjectRank(a) - subjectRank(b))
    .map(([subject, v]) => ({
      subject,
      name: v[0].subject_name,
      exams: EXAM_ORDER.filter((e) => v.some((s) => s.exam.type === e)),
      sets: [...v].sort((a, b) => EXAM_ORDER.indexOf(a.exam.type) - EXAM_ORDER.indexOf(b.exam.type) || b.exam.year - a.exam.year),
    }));
}

/** 名寄せ（決定018）：同じカードの肢は最初の1枚だけ残す */
export function uniqueCards<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = cardIdOf(x.id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type CardRef = { id: string; question_id: string };

/** index.json の肢カードの一覧（T038）から、肢 ID と問 ID を作る。問 ID は「束の ID-q11」 */
export function cardRefsOf(info: SetInfo): CardRef[] {
  return (info.cards ?? "")
    .split(" ")
    .filter(Boolean)
    .map((suffix) => ({ id: `${info.id}-${suffix}`, question_id: `${info.id}-${suffix.match(/^q\d+/)![0]}` }));
}

/** index.json を読み込む。肢カードの一覧も index.json から作り、束（問題文）は解くときに読む（T038）。
 *  端末に古い index.json が残っていて一覧がないときだけ、束を読んで作る */
export function useSets(): { sets: SetInfo[] | null; cardIds: Map<string, CardRef[]>; error: string | null } {
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardIds, setCardIds] = useState<Map<string, CardRef[]>>(new Map());
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => r.json())
      .then(async (d: { sets: SetInfo[]; aliases?: Record<string, string> }) => {
        await setAliases(d.aliases ?? {});
        setSets(d.sets);
        const pairs = await Promise.all(
          d.sets.map(async (s) => {
            if (s.cards !== undefined) return [s.id, cardRefsOf(s)] as const;
            const cards = (await loadSet(s)).statements.filter((x) => x.truth_at_exam && !x.review_flag);
            return [s.id, cards.map((x) => ({ id: x.id, question_id: x.question_id }))] as const;
          }),
        );
        setCardIds(new Map(pairs));
      })
      .catch((e) => setError(String(e)));
  }, []);
  return { sets, cardIds, error };
}
