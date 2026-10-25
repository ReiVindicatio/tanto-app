// 模試（T028）：本番の科目群（予備）・科目（司法 H27 以降）の問を、本番の時間で通しで解く。
// 試験時間・合格点・平均点・得点別人員は法務省の資料から読み取ったもの（exams.json。pipeline/exam_info.py）
import type { Question, SetInfo } from "./types";

export type Exams = {
  note: string;
  times: Record<string, { year: number; minutes: Record<string, number> }>;
  results: Record<
    string,
    {
      pass_total: number;
      total_full: number;
      scored: number;
      min_line_rate?: number;
      subjects: Record<string, { full: number; avg: number }>;
      /** 科目ごとの、0点からの人数（司法の H27 以降。読めない年度はない） */
      distribution?: Record<string, number[]>;
    }
  >;
  unreadable: string[];
};

let loading: Promise<Exams> | null = null;

export function loadExams(): Promise<Exams> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/exams.json`)
    .then((r) => r.json() as Promise<Exams>)
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** 模試の単位：予備は科目群、司法（H27 以降）は科目 */
export type MockUnit = { key: string; exam: string; year: number; era: string; group: string; name: string; subjects: string[]; sets: SetInfo[] };

const YOBI_GROUPS: { group: string; name: string; subjects: string[] }[] = [
  { group: "minji", name: "民法・商法・民事訴訟法", subjects: ["minpo", "shoho", "minso"] },
  { group: "kenpo-gyosei", name: "憲法・行政法", subjects: ["kenpo", "gyosei"] },
  { group: "keiji", name: "刑法・刑事訴訟法", subjects: ["keiho", "keiso"] },
];
const SHIHO_SUBJECTS: { group: string; name: string; subjects: string[] }[] = [
  { group: "minpo", name: "民法", subjects: ["minpo"] },
  { group: "kenpo", name: "憲法", subjects: ["kenpo"] },
  { group: "keiho", name: "刑法", subjects: ["keiho"] },
];
/** 司法試験は、3科目になった H27 から（それより前は試験時間の資料が法務省のサイトに残っていない） */
export const SHIHO_FIRST_YEAR = 2015;

/** 取り込んである年度の束から、模試の単位を作る（科目が全部そろっている単位だけ）。新しい年度から */
export function mockUnits(sets: SetInfo[]): MockUnit[] {
  const out: MockUnit[] = [];
  const years = [...new Set(sets.map((s) => `${s.exam.type}-${s.exam.year}`))];
  for (const y of years) {
    const [exam, ys] = y.split("-");
    const year = Number(ys);
    const defs = exam === "yobi" ? YOBI_GROUPS : year >= SHIHO_FIRST_YEAR ? SHIHO_SUBJECTS : [];
    for (const d of defs) {
      const unitSets = d.subjects.map((s) => sets.find((x) => x.exam.type === exam && x.exam.year === year && x.subject === s));
      if (unitSets.some((s) => !s)) continue;
      const sets_ = unitSets as SetInfo[];
      out.push({ key: `${exam}-${year}-${d.group}`, exam, year, era: sets_[0].exam.era, group: d.group, name: d.name, subjects: d.subjects, sets: sets_ });
    }
  }
  const order = (u: MockUnit) => [...YOBI_GROUPS, ...SHIHO_SUBJECTS].findIndex((d) => d.group === u.group);
  return out.sort((a, b) => b.year - a.year || order(a) - order(b));
}

/** 試験時間（分）。どの年度も、法務省のサイトに残っている受験案内（R08）の時間 */
export function minutesOf(exams: Exams, u: MockUnit): number | null {
  return exams.times[u.exam]?.minutes[u.group] ?? null;
}

/** 残り時間の表示（m:ss） */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type SubjectScore = { subject: string; earned: number; full: number };

/** 科目ごとの得点と満点（問の配点の和） */
export function subjectScores(questions: Question[], earned: Map<string, number>): SubjectScore[] {
  const m = new Map<string, SubjectScore>();
  for (const q of questions) {
    const x = m.get(q.subject) ?? { subject: q.subject, earned: 0, full: 0 };
    x.earned += earned.get(q.id) ?? 0;
    x.full += q.points;
    m.set(q.subject, x);
  }
  return [...m.values()];
}

/** 得点別人員から、その点数以上の受験者の割合（「上位○％」）。人数の並びは0点から */
export function topShare(counts: number[], score: number): number | null {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const s = Math.max(0, Math.min(counts.length - 1, Math.floor(score)));
  const atOrAbove = counts.slice(s).reduce((a, b) => a + b, 0);
  return atOrAbove / total;
}

// ---- 模試の履歴（端末だけ。同期はしない） ----

export type MockRecord = { key: string; earned: number; full: number; elapsedMs: number; timedOut: boolean; at: string };
const KEY = "tanto.mock.v1";

export function getMockHistory(): MockRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as MockRecord[]) : [];
  } catch {
    return [];
  }
}

export function addMockRecord(r: MockRecord): void {
  localStorage.setItem(KEY, JSON.stringify([...getMockHistory(), r]));
}
