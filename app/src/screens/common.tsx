// 画面で共通に使う小さな部品（T025）
import type { SubjectGroup, CardRef } from "../data";
import type { SetInfo } from "../types";
import { MINPO_REFORM_YEAR } from "../LawNote";
import { subjectColor } from "../subjectsMeta";

/** 科目の色の点 */
export function Dot({ subject }: { subject: string }) {
  return <span className="dot" style={{ background: subjectColor(subject) }} aria-hidden="true" />;
}

/** 進み具合の棒（0〜1） */
export function Progress({ value, color }: { value: number; color?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** 全年度・今日の復習の対象にする年度（民法は改正前を既定で除く：決定006） */
export function poolOf(g: SubjectGroup, includePreReform: boolean): SetInfo[] {
  const isMinpo = g.subject === "minpo";
  return g.sets.filter((s) => includePreReform || !isMinpo || s.exam.year >= MINPO_REFORM_YEAR);
}

export function cardsOf(sets: SetInfo[], cardIds: Map<string, CardRef[]>): CardRef[] {
  return sets.flatMap((s) => cardIds.get(s.id) ?? []);
}
