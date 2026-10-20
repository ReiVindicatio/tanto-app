import { useMemo, useState } from "react";
import type { DataSet, Explanation, Statement } from "./types";
import QuestionBody, { Context } from "./QuestionBody";
import ExplanationView from "./ExplanationView";
import ReportLink from "./ReportLink";
import LawNote from "./LawNote";
import { shuffle } from "./shuffle";
import { recordAnswer } from "./learning";
import { Progress } from "./screens/common";
import { StatementResult, type StatementResultItem } from "./ResultView";
import type { OriginOf } from "./play";

const BASIS_NOTE: Record<string, string> = {
  convention: "この肢の○×は、出題形式の慣行（正解の組合せ＝該当する肢の全部）から導いたものです。",
};

/** 肢カード。cards は出題する肢（○×のあるもの）、data はその肢の問・解説を含む束 */
export default function StatementDrill({
  title,
  data,
  cards,
  origin,
  onExit,
}: {
  title: string;
  data: DataSet;
  cards: Statement[];
  /** 問ごとの試験名・科目名（今日の○問では科目がまざる） */
  origin: OriginOf;
  onExit: () => void;
}) {
  const [order, setOrder] = useState<Statement[]>(cards);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [results, setResults] = useState<StatementResultItem[]>([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [showQuestion, setShowQuestion] = useState(false);

  const qById = useMemo(() => new Map(data.questions.map((q) => [q.id, q])), [data]);
  const sById = useMemo(() => new Map(data.statements.map((s) => [s.id, s])), [data]);
  const expById = useMemo(() => new Map(data.explanations.map((e) => [e.statement_id, e])), [data]);

  function restart(next: Statement[], shuffled: boolean) {
    setOrder(shuffled ? shuffle(next) : next);
    setI(0);
    setAnswer(null);
    setResults([]);
    setStartedAt(Date.now());
    setFinishedAt(null);
    setShowQuestion(false);
    window.scrollTo(0, 0);
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
      <StatementResult
        items={results}
        elapsedMs={(finishedAt ?? Date.now()) - startedAt}
        origin={origin}
        explanations={expById}
        onRetryWrong={() =>
          restart(
            results.filter((x) => !x.correct).map((x) => x.statement),
            true,
          )
        }
        onRetryAll={() => restart(order, true)}
        onExit={onExit}
      />
    );
  }

  const s = order[i];
  const q = qById.get(s.question_id)!;
  const truth = s.truth_at_exam!.value;
  const o = origin(q);

  function choose(v: boolean) {
    if (answer !== null) return;
    setAnswer(v);
    recordAnswer(s.id, v === truth);
    setResults((r) => [...r, { statement: s, question: q, correct: v === truth }]);
  }

  function next() {
    if (i + 1 >= order.length) setFinishedAt(Date.now());
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
          <button className="link" onClick={() => restart(cards, true)}>
            シャッフル
          </button>
        )}
      </div>
      <div className="play-progress">
        <Progress value={(i + (answer === null ? 0 : 1)) / order.length} />
      </div>

      <div className="muted small">
        {o.examName} {o.subjectName} {q.exam.era}（{q.exam.year}） 第{q.number}問
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
        <div className="actionbar">
          <button className="mark" onClick={() => choose(true)}>
            ○
          </button>
          <button className="mark" onClick={() => choose(false)}>
            ×
          </button>
        </div>
      ) : (
        <>
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
              出典の位置：{o.examName} {q.exam.era} {o.subjectName} 第{q.number}問
              {s.sub !== undefined && ` 小問${q.sub_questions[s.sub].marker}`} 肢{s.label}
            </div>
            <ReportLink target={s.id} context={reportContext(expById.get(s.id))} />
            {s.same_as && s.same_as.length > 0 && (
              <div className="muted small same-as">
                同じ肢：{s.same_as.map((x) => `${x.exam} ${x.era} 第${x.number}問 肢${x.label}`).join("・")}
                （1枚のカードとして記録します）
              </div>
            )}
            <div className="row">
              <button className="secondary small" onClick={() => setShowQuestion(!showQuestion)}>
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
          <div className="actionbar">
            <button onClick={next}>次へ</button>
          </div>
        </>
      )}
    </section>
  );
}

/** 誤り報告に自動で付ける情報（T040）：どの版の解説を見て報告したか */
function reportContext(e: Explanation | undefined): Record<string, unknown> {
  return { screen: "statement", explanation: e ? { model: e.model, prompt_version: e.prompt_version, generated_at: e.generated_at } : null };
}
