// 科目ごとの表示（T025）：並び順と色。色はカードの左の帯と点に使う
export const SUBJECT_ORDER = ["minpo", "shoho", "minso", "keiho", "keiso", "kenpo", "gyosei"];

export const SUBJECT_COLOR: Record<string, string> = {
  minpo: "#f66e61",
  shoho: "#e9a23b",
  minso: "#3fa7a3",
  keiho: "#5b8bd9",
  keiso: "#9a7bd6",
  kenpo: "#d46fa0",
  gyosei: "#6aa86a",
};

export function subjectColor(subject: string): string {
  return SUBJECT_COLOR[subject] ?? "#8a9699";
}

export function subjectRank(subject: string): number {
  const i = SUBJECT_ORDER.indexOf(subject);
  return i === -1 ? 99 : i;
}
