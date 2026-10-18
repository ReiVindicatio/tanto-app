import { useMemo, useState } from "react";
import type { DataSet, Statement } from "./types";
import QuestionBody, { Context } from "./QuestionBody";
import ExplanationView from "./ExplanationView";
import LawNote from "./LawNote";
import { shuffle } from "./shuffle";
import { recordAnswer } from "./history";
import { review } from "./srs";

const BASIS_NOTE: Record<string, string> = {
  convention: "この肢の○×は、出題形式の慣行（正解の組合せ＝該当する肢の全部）から導いたものです。",
};

/** 肢カード。cards は出題する肢（○×のあるもの）、data はその肢の問・解説を含む束 */
export default function StatementDrill({
  title,
  data,
  cards,
  examName,
  subjectName,
  onExit,
}: {
  title: string;
  data: DataSet;
  cards: Statement[];
  examName: string;
  subjectName: string;
  onExit: () => void;
}) {
  const [order, setOrder] = useState<Statement[]>(cards);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [showQuestion, setShowQuestion] = useState(false);

  const qById = useMemo(() => new Map(data.questions.map((q) => [q.id, q])), [data]);
  const sById = useMemo(() => new Map(data.statements.map((s) => [s.id, s])), [data]);
  const expById = useMemo(() => new Map(data.explanations.map((e) => [e.statement_id, e])), [data]);

  function restart(shuffled: boolean) {
    setOrder(shuffled ? shuffle(cards) : cards);
    setI(0);
    setAnswer(null);
    setScore({ correct: 0, total: 0 });
    setShowQuestion(false);
  }

  if (order.length === 0) {
    return (
      <section>
        <h1>出題できる肢がありません</h1>
        <p className="muted">絞り込みの条件に当てはまる肢がありませんでした。</p>
        <button className="secondary" onClick={onExit}>
          戻る
        </button>
      </section>
    );
  }

  if (i >= order.length) {
    return (
      <section>
        <h1>おわり</h1>
        <p className="big">
          {score.correct} / {score.total} 正解
        </p>
        <div className="row">
          <button onClick={() => restart(true)}>シャッフルしてもう一度</button>
          <button className="secondary" onClick={onExit}>
            戻る
          </button>
        </div>
      </section>
    );
  }

  const s = order[i];
  const q = qById.get(s.question_id)!;
  const truth = s.truth_at_exam!.value;

  function choose(v: boolean) {
    if (answer !== null) return;
    setAnswer(v);
    recordAnswer(s.id, v === truth);
    review(s.id, v === truth);
    setScore((sc) => ({ correct: sc.correct + (v === truth ? 1 : 0), total: sc.total + 1 }));
  }

  function next() {
    setI(i + 1);
    setAnswer(null);
    setShowQuestion(false);
  }

  return (
    <section>
      <div className="toolbar">
        <button className="link" onClick={onExit}>
          ← 戻る
        </button>
        <span className="muted small">
          {title}　{i + 1} / {order.length}
        </span>
        {i === 0 && answer === null && (
          <button className="link" onClick={() => restart(true)}>
            シャッフル
          </button>
        )}
      </div>

      <div className="muted small">
        {examName} {q.exam.era}（{q.exam.year}） 第{q.number}問
      </div>
      <p className="stem small muted">{q.stem}</p>
      {s.requires_context && <Context q={q} />}
      {s.sub !== undefined && (
        <p className="stem small">
          {q.sub_questions[s.sub].marker} {q.sub_questions[s.sub].stem}
        </p>
      )}
      <p className="statement">{s.text}</p>

      {answer === null ? (
        <div className="row answer-buttons">
          <button className="mark" onClick={() => choose(true)}>
            ○
          </button>
          <button className="mark" onClick={() => choose(false)}>
            ×
          </button>
        </div>
      ) : (
        <div className={`result ${answer === truth ? "ok" : "ng"}`}>
          <div className="big">{answer === truth ? "正解" : "不正解"}</div>
          <div>
            この記述は <strong>{truth ? "○（正しい）" : "×（誤り）"}</strong>
            <span className="muted small">　出題時点の公式の解答による</span>
          </div>
          <LawNote q={q} />
          {BASIS_NOTE[s.truth_at_exam!.basis] && <p className="small muted">{BASIS_NOTE[s.truth_at_exam!.basis]}</p>}
          {expById.has(s.id) ? (
            <ExplanationView e={expById.get(s.id)!} />
          ) : (
            <p className="muted small">この肢の解説はまだありません。</p>
          )}
          <div className="muted small">
            出典の位置：{examName} {q.exam.era} {subjectName} 第{q.number}問
            {s.sub !== undefined && ` 小問${q.sub_questions[s.sub].marker}`} 肢{s.label}
          </div>
          <div className="row">
            <button onClick={next}>次へ</button>
            <button className="secondary" onClick={() => setShowQuestion(!showQuestion)}>
              {showQuestion ? "元の問題を閉じる" : "元の問題を見る"}
            </button>
          </div>
          {showQuestion && (
            <QuestionBody
              q={q}
              statements={q.statements.map((id) => sById.get(id)!)}
              showTruth={true}
              highlight={s.id}
              explanations={expById}
            />
          )}
        </div>
      )}
    </section>
  );
}
