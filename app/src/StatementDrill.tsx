import { useMemo, useState } from "react";
import type { DataSet, SetInfo, Statement } from "./types";
import QuestionBody, { Context } from "./QuestionBody";
import ExplanationView from "./ExplanationView";
import { shuffle } from "./shuffle";

const BASIS_NOTE: Record<string, string> = {
  convention: "この肢の○×は、出題形式の慣行（正解の組合せ＝該当する肢の全部）から導いたものです。",
};

export default function StatementDrill({ info, data, onExit }: { info: SetInfo; data: DataSet; onExit: () => void }) {
  const cards = useMemo(() => data.statements.filter((s) => s.truth_at_exam), [data]);
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
          {info.exam_name} {info.exam.era} {info.subject_name}　{i + 1} / {order.length}
        </span>
        {i === 0 && answer === null && (
          <button className="link" onClick={() => restart(true)}>
            シャッフル
          </button>
        )}
      </div>

      <p className="stem small muted">{q.stem}</p>
      {s.requires_context && <Context q={q} />}
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
          {BASIS_NOTE[s.truth_at_exam!.basis] && <p className="small muted">{BASIS_NOTE[s.truth_at_exam!.basis]}</p>}
          {expById.has(s.id) ? (
            <ExplanationView e={expById.get(s.id)!} />
          ) : (
            <p className="muted small">この肢の解説はまだありません。</p>
          )}
          <div className="muted small">
            出典の位置：{info.exam_name} {info.exam.era} {info.subject_name} 第{q.number}問 肢{s.label}
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
