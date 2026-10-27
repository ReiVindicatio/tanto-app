import { useMemo, useState } from "react";
import ReportLink from "./ReportLink";
import type { DataSet, Question, QuestionExplanation, SetInfo } from "./types";
import ExplanationView from "./ExplanationView";
import QuestionBody from "./QuestionBody";
import { grade, slotOptions, type Grade } from "./grade";
import LawNote from "./LawNote";
import { Progress } from "./screens/common";
import { QuestionResult, type QuestionResultItem } from "./ResultView";
import { RitsuDock, useIdle } from "./Ritsu";
import { characterOn } from "./character";

export default function QuestionDrill({ info, data, onExit }: { info: SetInfo; data: DataSet; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => emptyPicks(data.questions[0]));
  const [result, setResult] = useState<Grade | null>(null);
  const [showChar] = useState(characterOn);
  const idle = useIdle(120000);
  const [scores, setScores] = useState<QuestionResultItem[]>([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const sById = useMemo(() => new Map(data.statements.map((s) => [s.id, s])), [data]);
  const expById = useMemo(() => new Map(data.explanations.map((e) => [e.statement_id, e])), [data]);
  const qexpById = useMemo(() => new Map((data.question_explanations ?? []).map((e) => [e.question_id, e])), [data]);

  if (i >= data.questions.length) {
    return (
      <QuestionResult
        items={scores}
        elapsedMs={(finishedAt ?? Date.now()) - startedAt}
        onRetry={() => {
          setI(0);
          setPicks(emptyPicks(data.questions[0]));
          setResult(null);
          setScores([]);
          setStartedAt(Date.now());
          setFinishedAt(null);
          window.scrollTo(0, 0);
        }}
        onExit={onExit}
      />
    );
  }

  const q = data.questions[i];
  const statements = q.statements.map((id) => sById.get(id)!);

  function pick(k: number, v: number) {
    if (result) return;
    setPicks((p) => p.map((x, j) => (j === k ? (x === v ? null : v) : x)));
  }

  function submit() {
    const g = grade(q, picks);
    setResult(g);
    setScores((sc) => [...sc, { question: q, earned: g.earned }]);
  }

  function next() {
    const n = i + 1;
    if (n >= data.questions.length) setFinishedAt(Date.now());
    setI(n);
    setResult(null);
    if (n < data.questions.length) setPicks(emptyPicks(data.questions[n]));
  }

  return (
    <section>
      <div className="toolbar">
        <button className="link" onClick={onExit}>
          ← 戻る
        </button>
        <span className="muted small">
          {info.exam_name} {info.exam.era} {info.subject_name}　{i + 1} / {data.questions.length}
        </span>
      </div>
      <div className="play-progress">
        <Progress value={(i + (result ? 1 : 0)) / data.questions.length} />
      </div>

      <QuestionBody q={q} statements={statements} showTruth={result !== null} explanations={expById} />

      {q.format === "classify_each" && q.classes && q.choices.length === 0 && (
        <div className="classes">
          <div className="muted small">選ぶ番号</div>
          {q.classes.map((c) => (
            <div key={c.value}>
              <strong>{c.value}</strong>：{c.label}
            </div>
          ))}
        </div>
      )}

      <div className="slots">
        {q.answer_slots.map((slot, k) => (
          <div className="slot" key={slot.no}>
            <div className="slot-name">
              No.{slot.no}
              {slot.statement_label && `（${slot.statement_label}）`}
              {slot.sub !== undefined && `（小問${q.sub_questions[slot.sub].marker}）`}
              {q.unordered && k === 0 && <span className="muted small">　順不同</span>}
            </div>
            <div className="row">
              {slotOptions(q, k, statements).map((o) => {
                const chosen = picks[k] === o.value;
                const cls = ["opt", chosen ? "chosen" : "", result && chosen ? (result.correct[k] ? "ok" : "ng") : ""].join(" ");
                return (
                  <button key={o.value} className={cls} onClick={() => pick(k, o.value)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
            {result && (
              <div className="small">
                正解：<strong>{answerText(q, k)}</strong>
              </div>
            )}
          </div>
        ))}
      </div>

      {!result ? (
        <div className={`actionbar${showChar ? " with-ritsu" : ""}`}>
          {/* 律（T065）：答える前は○×の欄の縁で考え中（しばらく採点しないと寝そべる）。採点したら満点で喜んで跳ねる */}
          {showChar && <RitsuDock face={idle ? "sleepy" : "think"} pose={idle ? "lie" : "sit"} swing lively className="bar-dock" />}
          <button disabled={picks.some((p) => p === null)} onClick={submit}>
            採点する
          </button>
        </div>
      ) : (
        <>
          <div className={`result ${result.full ? "ok" : "ng"}`}>
            <div className="big">
              {result.earned} / {q.points} 点
            </div>
            {q.scoring.raw_note && <div className="muted small">正答表の備考：{q.scoring.raw_note}</div>}
            {(q.status?.all_correct || q.status?.voided) && (
              <div className="small law-note">この問は、法務省の採点上の取扱いにより全員正答として扱われました。</div>
            )}
            <LawNote q={q} />
            {qexpById.has(q.id) && (
              <details className="question-explanation" open>
                <summary>この問の解説</summary>
                <ExplanationView e={qexpById.get(q.id)!} />
              </details>
            )}
            <ReportLink target={q.id} context={reportContext(qexpById.get(q.id))} />
          </div>
          <div className={`actionbar${showChar ? " with-ritsu" : ""}`}>
            {showChar && <RitsuDock face={result.full ? "happy" : "sad"} hop={result.full} className="bar-dock" />}
            <button onClick={next}>次へ</button>
          </div>
        </>
      )}
    </section>
  );
}

function emptyPicks(q: Question | undefined): (number | null)[] {
  return q ? q.answer_slots.map(() => null) : [];
}

export function answerText(q: Question, k: number): string {
  // 全員正答の扱いで、正答表の解答欄が空欄の問（司法 R05 刑法 第6問）
  if (q.answer_slots.some((s) => s.official_answer === null)) return "—（公式の解答の掲載なし）";
  if (q.unordered) return q.answer_slots.map((s) => s.official_answer).join("・") + "（順不同）";
  const v = q.answer_slots[k].official_answer;
  if (q.format === "true_false_each") return v === 1 ? "1（正しい）" : "2（誤り）";
  if (q.format === "classify_each") {
    const c = q.classes?.find((x) => x.value === v);
    return c ? `${v}（${c.label}）` : String(v);
  }
  return String(v);
}

/** 誤り報告に自動で付ける情報（T040・T018）：どの版の問の解説を見て報告したか */
function reportContext(e: QuestionExplanation | undefined): Record<string, unknown> {
  return { screen: "question", explanation: e ? { model: e.model, prompt_version: e.prompt_version, generated_at: e.generated_at } : null };
}
