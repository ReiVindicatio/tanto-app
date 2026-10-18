import type { Question } from "./types";

/** 解答欄ごとに選べる番号と、その表示 */
export function slotOptions(q: Question): { value: number; label: string }[] {
  switch (q.format) {
    case "true_false_each":
      return [
        { value: 1, label: "1（正しい）" },
        { value: 2, label: "2（誤り）" },
      ];
    case "single_choice":
    case "multi_select_unordered":
      return q.statements.map((_, k) => ({ value: k + 1, label: String(k + 1) }));
    default:
      return q.choices.map((c) => ({ value: c.number, label: String(c.number) }));
  }
}

export type Grade = { correct: boolean[]; correctCount: number; earned: number; full: boolean };

/** 本番の採点に合わせる：順不同は集合で比べる。部分点は正答表の備考どおり */
export function grade(q: Question, picks: (number | null)[]): Grade {
  const official = q.answer_slots.map((s) => s.official_answer);
  let correct: boolean[];
  if (q.unordered) {
    const want = new Set(official);
    const seen = new Set<number>();
    correct = picks.map((p) => {
      const ok = p !== null && want.has(p) && !seen.has(p);
      if (p !== null) seen.add(p);
      return ok;
    });
  } else {
    correct = picks.map((p, k) => p === official[k]);
  }
  const correctCount = correct.filter(Boolean).length;
  const full = correctCount === official.length;
  let earned = 0;
  if (full) earned = q.points;
  else if (q.scoring.partial_credit && correctCount >= q.scoring.partial_credit.correct_needed)
    earned = q.scoring.partial_credit.points;
  return { correct, correctCount, earned, full };
}
