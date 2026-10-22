import type { Explanation, Question, Statement } from "./types";
import ExplanationView from "./ExplanationView";
import StarButton from "./Bookmark";

export function Context({ q }: { q: Question }) {
  if (q.context.length === 0) return null;
  return (
    <>
      {q.context.map((c, i) => (
        <div className="context" key={i}>
          <div className="context-kind">【{c.kind}】</div>
          {c.text.split("\n").map((line, j) => (
            <p key={j}>{line}</p>
          ))}
        </div>
      ))}
    </>
  );
}

export function truthMark(s: Statement): string {
  if (!s.truth_at_exam) return "";
  return s.truth_at_exam.value ? "○" : "×";
}

/** 問の全文（リード文・前提文・肢・選択肢）。showTruth で肢ごとの○×を添える */
export default function QuestionBody({
  q,
  statements,
  showTruth,
  highlight,
  explanations,
}: {
  q: Question;
  statements: Statement[];
  showTruth: boolean;
  highlight?: string;
  explanations?: Map<string, Explanation>;
}) {
  return (
    <div className="question">
      <div className="muted small">
        第{q.number}問（配点：{q.points}）
      </div>
      <p className="stem">{q.stem}</p>
      <Context q={q} />
      {statements.length > 0 && (
        <ol className="statements">
          {statements.map((s, i) => (
            <li key={s.id} className={s.id === highlight ? "highlight" : ""}>
              {s.sub !== undefined && s.sub !== statements[i - 1]?.sub && (
                <p className="stem">
                  {q.sub_questions[s.sub].marker} {q.sub_questions[s.sub].stem}
                </p>
              )}
              <span className="label">{s.label}．</span>
              <span>{s.text}</span>
              {showTruth && s.truth_at_exam && (
                <span className={`truth ${s.truth_at_exam.value ? "ok" : "ng"}`}>{truthMark(s)}</span>
              )}
              {showTruth && s.truth_at_exam && !s.review_flag && <StarButton id={s.id} compact />}
              {showTruth && s.review_flag && (
                <span className="small law-note">
                  {s.review_flag.kind === "law_changed"
                    ? "要確認：出題後の法改正（判例の変更を含む）で正誤が変わる肢です。○×は出題時点の正解です（肢カードには出していません）"
                    : "要確認：この肢の○×は導出の根拠が弱く、確認中です（肢カードには出していません）"}
                </span>
              )}
              {showTruth && s.id !== highlight && explanations?.has(s.id) && (
                <details className="small">
                  <summary>解説</summary>
                  <ExplanationView e={explanations.get(s.id)!} />
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {q.choices.length > 0 && (
        <ol className="choices">
          {q.choices.map((c) => (
            <li key={c.number}>
              <span className="label">{c.number}．</span>
              {c.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
