// data/questions/ の正本と同じ形（pipeline/derive.py が書き出す）

export type Exam = { type: string; year: number; era: string };

export type Attribution = { text: string; source_pdfs: string[]; note: string };

export type Choice = {
  number: number;
  text: string;
  labels?: string[];
  blanks?: { blank: number; word: string }[];
  count?: number | null;
  /** ○×の組合せ（mark_combination）の各肢の○×（決定016） */
  marks?: { label: string; value: boolean }[];
};

export type Slot = { no: number; official_answer: number; statement_label?: string; sub?: number };

/** 小問（⑴⑵…）。H26 民法 問5 のような形式 */
export type SubQuestion = { marker: string; stem: string; format: Format; polarity: "correct" | "incorrect" | null };

export type Format =
  | "combination"
  | "single_choice"
  | "multi_select_unordered"
  | "true_false_each"
  | "mark_combination"
  | "classify_each"
  | "count"
  | "fill_blank"
  | "compound"
  | "meta_choice"
  | "unknown";

export type Question = {
  id: string;
  exam: Exam;
  subject: string;
  number: number;
  points: number;
  format: Format;
  polarity: "correct" | "incorrect" | null;
  exhaustive: boolean;
  unordered: boolean;
  stem: string;
  context: { kind: string; text: string }[];
  sub_questions: SubQuestion[];
  requires_context: boolean;
  choices: Choice[];
  answer_slots: Slot[];
  scoring: {
    partial_credit: { correct_needed: number; points: number } | null;
    no_partial_credit: boolean;
    raw_note: string;
  };
  statements: string[];
  statement_truth_derivable: boolean;
  /** 区分を選ぶ形式（classify_each）の区分の一覧。ラベルはリード文の文字列そのまま（T033・決定014） */
  classes?: { value: number; label: string }[];
  /** 法務省の採点上の取扱い（T006）。all_correct：全員正答として扱われた問 */
  status?: { voided: boolean; all_correct: boolean; errata: { content?: string; treatment?: string; source_url?: string }[] };
};

export type TruthBasis = "direct" | "selected" | "exhaustive" | "uniqueness" | "convention";

export type Statement = {
  id: string;
  question_id: string;
  label: string;
  text: string;
  requires_context: boolean;
  sub?: number;
  /** 人の確認待ち（data/review/flags.json）。肢カードには出さない */
  review_flag?: { kind: string; reason: string };
  truth_at_exam: { value: boolean; derivation: string; basis: TruthBasis } | null;
};

export type StatuteCitation = {
  type: "statute";
  law: string;
  article: string;
  paragraphs: string[];
  quote: string;
  fetched_at: string;
  source_url: string;
};

/** 検査（pipeline/check_explanations.py）を通った AI 生成の解説だけが入る */
export type Explanation = {
  id: string;
  statement_id: string;
  version: number;
  conclusion: string;
  body: string;
  citations: StatuteCitation[];
  cases: { name: string; court: string; date: string; holding: string }[];
  prompt_version: string;
  generated_at: string;
  model: string;
};

export type DataSet = {
  attribution: Attribution;
  exam: Exam;
  subject: string;
  questions: Question[];
  statements: Statement[];
  explanations: Explanation[];
};

export type SetInfo = {
  id: string;
  file: string;
  exam: Exam;
  exam_name: string;
  subject: string;
  subject_name: string;
  questions: number;
  statement_cards: number;
  explanations: number;
  attribution: Attribution;
};
