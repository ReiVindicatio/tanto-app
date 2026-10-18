import type { Question } from "./types";

// 古い年度の肢は「出題時点の正解」で、その後の法改正を反映していない（現行法での正誤は未確認）
export const LATEST_YEAR = 2026;
// 民法（債権関係）の改正（2017年成立・2020年4月施行）より前の出題
export const MINPO_REFORM_YEAR = 2020;

export function isPreReform(q: Question): boolean {
  return q.subject === "minpo" && q.exam.year < MINPO_REFORM_YEAR;
}

export default function LawNote({ q }: { q: Question }) {
  if (q.exam.year >= LATEST_YEAR) return null;
  return (
    <p className="small law-note">
      {isPreReform(q)
        ? "⚠️ 2017年の民法（債権関係）改正（2020年4月施行）より前の出題です。現行法では正誤が変わる肢があります（現行法での正誤は未確認）。"
        : `⚠️ ${q.exam.year}年の出題時点の正解です。その後の法改正で正誤が変わっている可能性があります（未確認）。`}
    </p>
  );
}
