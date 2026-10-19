import { useMemo, useState } from "react";
import type { DataSet, Question, SetInfo } from "./types";
import QuestionBody from "./QuestionBody";
import { grade, slotOptions, type Grade } from "./grade";
import LawNote from "./LawNote";

export default function QuestionDrill({ info, data, onExit }: { info: SetInfo; data: DataSet; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => emptyPicks(data.questions[0]));
  const [result, setResult] = useState<Grade | null>(null);
  const [total, setTotal] = useState({ earned: 0, points: 0 });
  const sById = useMemo(() => new Map(data.statements.map((s) => [s.id, s])), [data]);
  const expById = useMemo(() => new Map(data.explanations.map((e) => [e.statement_id, e])), [data]);

  if (i >= data.questions.length) {
    return (
      <section>
        <h1>おわり</h1>
        <p className="big">
          {total.earned} / {total.points} 点
        </p>
        <div className="row">
          <button
            onClick={() => {
              setI(0);
              setPicks(emptyPicks(data.questions[0]));
              setResult(null);
              setTotal({ earned: 0, points: 0 });
            }}
          >
            もう一度
          </button>
          <button className="secondary" onClick={onExit}>
            戻る
          </button>
        </div>
      </section>
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
    setTotal((t) => ({ earned: t.earned + g.earned, points: t.points + q.points }));
  }

  function next() {
    const n = i + 1;
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

      <QuestionBody q={q} statements={statements} showTruth={result !== null} explanations={expById} />

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
                const cls = [
                  "opt",
                  chosen ? "chosen" : "",
                  result && chosen ? (result.correct[k] ? "ok" : "ng") : "",
                ].join(" ");
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
        <button disabled={picks.some((p) => p === null)} onClick={submit}>
          採点する
        </button>
      ) : (
        <div className={`result ${result.full ? "ok" : "ng"}`}>
          <div className="big">
            {result.earned} / {q.points} 点
          </div>
          {q.scoring.raw_note && <div className="muted small">正答表の備考：{q.scoring.raw_note}</div>}
          {(q.status?.all_correct || q.status?.voided) && (
            <div className="small law-note">この問は、法務省の採点上の取扱いにより全員正答として扱われました。</div>
          )}
          <LawNote q={q} />
          <button onClick={next}>次へ</button>
        </div>
      )}
    </section>
  );
}

function emptyPicks(q: Question | undefined): (number | null)[] {
  return q ? q.answer_slots.map(() => null) : [];
}

function answerText(q: Question, k: number): string {
  if (q.unordered) return q.answer_slots.map((s) => s.official_answer).join("・") + "（順不同）";
  const v = q.answer_slots[k].official_answer;
  if (q.format === "true_false_each") return v === 1 ? "1（正しい）" : "2（誤り）";
  return String(v);
}
