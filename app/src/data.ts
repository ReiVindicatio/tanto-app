// 問題データの読み込み（T025 で App.tsx から切り出し）
import { useEffect, useState } from "react";
import type { DataSet, SetInfo } from "./types";
import { subjectRank } from "./subjectsMeta";

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

export type SubjectGroup = { subject: string; name: string; examName: string; sets: SetInfo[] };

/** 科目ごとにまとめる（科目は決まった順、年度は新しい順） */
export function groupBySubject(sets: SetInfo[]): SubjectGroup[] {
  const m = new Map<string, SetInfo[]>();
  for (const s of sets) m.set(s.subject, [...(m.get(s.subject) ?? []), s]);
  return [...m.entries()]
    .sort(([a], [b]) => subjectRank(a) - subjectRank(b))
    .map(([subject, v]) => ({
      subject,
      name: v[0].subject_name,
      examName: v[0].exam_name,
      sets: [...v].sort((a, b) => b.exam.year - a.exam.year),
    }));
}

export type CardRef = { id: string; question_id: string };

/** index.json と、束ごとの肢カード（集計用）を読み込む */
export function useSets(): { sets: SetInfo[] | null; cardIds: Map<string, CardRef[]>; error: string | null } {
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardIds, setCardIds] = useState<Map<string, CardRef[]>>(new Map());
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => r.json())
      .then(async (d: { sets: SetInfo[] }) => {
        setSets(d.sets);
        const pairs = await Promise.all(
          d.sets.map(async (s) => {
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
