import type { Question } from "./types";

// 古い年度の肢は「出題時点の正解」で、その後の法改正を反映していない（現行法での正誤は未確認）
export const LATEST_YEAR = 2026;
// 民法（債権関係）の改正（2017年成立・2020年4月施行）より前の出題
export const MINPO_REFORM_YEAR = 2020;

// 刑法：2025年6月の拘禁刑の導入（懲役・禁錮の廃止）。2023年には性犯罪の規定も改正された（T033）
export const KEIHO_KOKIN_YEAR = 2025;

export function isPreReform(q: Question): boolean {
  return q.subject === "minpo" && q.exam.year < MINPO_REFORM_YEAR;
}

export default function LawNote({ q }: { q: Question }) {
  if (q.exam.year >= LATEST_YEAR) return null;
  return (
    <p className="small law-note">
      {isPreReform(q)
        ? "⚠️ 2017年の民法（債権関係）改正（2020年4月施行）より前の出題です。現行法では正誤が変わる肢があります（現行法での正誤は未確認）。"
        : q.subject === "keiho" && q.exam.year <= KEIHO_KOKIN_YEAR
          ? "⚠️ 2025年6月の拘禁刑の導入（懲役・禁錮の廃止）より前の出題です。2023年には性犯罪の規定も改正されています。現行法では文言や正誤が変わる肢があります（現行法での正誤は未確認）。"
          : `⚠️ ${q.exam.year}年の出題時点の正解です。その後の法改正で正誤が変わっている可能性があります（未確認）。`}
    </p>
  );
}
