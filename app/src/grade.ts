import type { Question, Statement } from "./types";

const numbers = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

/** 解答欄 k で選べる番号と、その表示。statements は問の肢（順番どおり） */
export function slotOptions(q: Question, k: number, statements: Statement[]): { value: number; label: string }[] {
  switch (q.format) {
    case "compound": {
      // 小問ごとに、その小問の肢の数だけ選べる
      const sub = q.answer_slots[k].sub;
      return numbers(statements.filter((s) => s.sub === sub).length);
    }
    case "true_false_each":
      return [
        { value: 1, label: "1（正しい）" },
        { value: 2, label: "2（誤り）" },
      ];
    case "single_choice":
    case "multi_select_unordered":
      return numbers(statements.length);
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
  // 全員正答・没問として扱われた問は、何を選んでも満点（法務省の採点上の取扱い。T006）
  if (q.status?.all_correct || q.status?.voided) {
    return { correct: picks.map(() => true), correctCount: picks.length, earned: q.points, full: true };
  }
  const correctCount = correct.filter(Boolean).length;
  const full = correctCount === official.length;
  let earned = 0;
  if (full) earned = q.points;
  else if (q.scoring.partial_credit && correctCount >= q.scoring.partial_credit.correct_needed)
    earned = q.scoring.partial_credit.points;
  return { correct, correctCount, earned, full };
}
