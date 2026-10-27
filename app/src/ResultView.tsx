// 結果画面（T023）：正答率の円グラフ・科目ごとの内訳・まちがえた肢の一覧・やり直し
import type { Explanation, Question, Statement } from "./types";
import ExplanationView from "./ExplanationView";
import { subjectColor, subjectRank } from "./subjectsMeta";
import type { OriginOf } from "./play";
import { useState } from "react";
import { characterOn } from "./character";
import { RitsuSays } from "./Ritsu";
import { resultLine } from "./ritsu/lines";
import { progressNow } from "./progress";

/** 結果画面の律（T063・T065）。正答率でセリフを選ぶ（点数そのものには触れない） */
function ResultRitsu({ rate }: { rate: number }) {
  const [line] = useState(() => resultLine(rate, progressNow().level));
  if (!characterOn() || !line) return null;
  return (
    <RitsuSays face={line.face} className="result-ritsu">
      {line.text}
    </RitsuSays>
  );
}

/** 円グラフ（0〜1）。中央に％ */
export function Donut({ value, label }: { value: number; label?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg
      className="donut"
      viewBox="0 0 120 120"
      width="140"
      height="140"
      role="img"
      aria-label={label ?? `${Math.round(v * 100)}%`}
    >
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--chrome)" strokeWidth="14" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="var(--ok)"
        strokeWidth="14"
        strokeLinecap={v > 0 && v < 1 ? "round" : "butt"}
        strokeDasharray={`${c * v} ${c}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="donut-text">
        {Math.round(v * 100)}%
      </text>
    </svg>
  );
}

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}分${sec % 60}秒` : `${sec}秒`;
}

export type StatementResultItem = { statement: Statement; question: Question; correct: boolean };

/** 肢で解くの終わり */
export function StatementResult({
  items,
  elapsedMs,
  origin,
  explanations,
  onRetryWrong,
  onRetryAll,
  onExit,
}: {
  items: StatementResultItem[];
  elapsedMs: number;
  origin: OriginOf;
  explanations: Map<string, Explanation>;
  onRetryWrong: () => void;
  onRetryAll: () => void;
  onExit: () => void;
}) {
  const correct = items.filter((x) => x.correct).length;
  const wrong = items.filter((x) => !x.correct);
  // 科目ごとの内訳（科目が複数のときだけ出す）
  const bySubject = new Map<string, { name: string; correct: number; total: number }>();
  for (const x of items) {
    const k = x.question.subject;
    const e = bySubject.get(k) ?? { name: origin(x.question).subjectName, correct: 0, total: 0 };
    bySubject.set(k, { ...e, correct: e.correct + (x.correct ? 1 : 0), total: e.total + 1 });
  }

  return (
    <section className="result-screen">
      <h1>おわり</h1>
      <ResultRitsu rate={items.length ? correct / items.length : 0} />
      <div className="result-summary">
        <Donut
          value={items.length ? correct / items.length : 0}
          label={`正答率 ${items.length ? Math.round((correct / items.length) * 100) : 0}%`}
        />
        <div>
          <p className="big">
            {correct} / {items.length} 正解
          </p>
          <p className="muted small">かかった時間 {formatDuration(elapsedMs)}</p>
        </div>
      </div>

      {bySubject.size > 1 && (
        <div className="card">
          <div className="muted small">科目ごと</div>
          {[...bySubject.entries()]
            .sort(([a], [b]) => subjectRank(a) - subjectRank(b))
            .map(([k, v]) => (
              <div className="breakdown-row" key={k}>
                <span className="dot" style={{ background: subjectColor(k) }} aria-hidden="true" />
                <span className="grow">{v.name}</span>
                <span className="small">
                  {v.correct} / {v.total}
                </span>
              </div>
            ))}
        </div>
      )}

      <div className="row result-actions">
        {wrong.length > 0 && <button onClick={onRetryWrong}>まちがえた肢だけもう一度（{wrong.length}枚）</button>}
        <button className={wrong.length > 0 ? "secondary" : ""} onClick={onRetryAll}>
          もう一度（シャッフル）
        </button>
        <button className="secondary" onClick={onExit}>
          戻る
        </button>
      </div>

      {wrong.length > 0 && (
        <>
          <h2>まちがえた肢（{wrong.length}）</h2>
          <div className="wrong-list">
            {wrong.map(({ statement: s, question: q }) => {
              const o = origin(q);
              const e = explanations.get(s.id);
              return (
                <details className="wrong-item" key={s.id}>
                  <summary>
                    <span className="muted small">
                      {o.subjectName} {q.exam.era} 第{q.number}問 肢{s.label}
                    </span>
                    <span className="wrong-answer">正解は {s.truth_at_exam!.value ? "○" : "×"}</span>
                    <span className="wrong-text">{s.text}</span>
                  </summary>
                  {e ? <ExplanationView e={e} /> : <p className="muted small">この肢の解説はまだありません。</p>}
                </details>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export type QuestionResultItem = { question: Question; earned: number };

/** 問で解くの終わり */
export function QuestionResult({
  items,
  elapsedMs,
  onRetry,
  onExit,
}: {
  items: QuestionResultItem[];
  elapsedMs: number;
  onRetry: () => void;
  onExit: () => void;
}) {
  const earned = items.reduce((n, x) => n + x.earned, 0);
  const points = items.reduce((n, x) => n + x.question.points, 0);
  return (
    <section className="result-screen">
      <h1>おわり</h1>
      <ResultRitsu rate={points ? earned / points : 0} />
      <div className="result-summary">
        <Donut value={points ? earned / points : 0} label={`得点率 ${points ? Math.round((earned / points) * 100) : 0}%`} />
        <div>
          <p className="big">
            {earned} / {points} 点
          </p>
          <p className="muted small">かかった時間 {formatDuration(elapsedMs)}</p>
        </div>
      </div>
      <div className="row result-actions">
        <button onClick={onRetry}>もう一度</button>
        <button className="secondary" onClick={onExit}>
          戻る
        </button>
      </div>
      <h2>問ごとの得点</h2>
      <div className="list">
        {items.map(({ question: q, earned: e }) => (
          <div className={`list-row score-row ${e === q.points ? "full" : e === 0 ? "zero" : "partial"}`} key={q.id}>
            <span className="grow">第{q.number}問</span>
            <span className="small">
              {e} / {q.points} 点
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
