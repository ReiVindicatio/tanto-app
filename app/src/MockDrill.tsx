// 模試（T028）：本番の時間で、科目群（司法は科目）の問を通しで解く。答えはその場で採点せず、提出したとき（時間が来たら自動で）
// まとめて採点する。肢ごとの記録はしない（「問で解く」と同じ）。点数だけ模試の履歴として端末に残す
import { useEffect, useMemo, useRef, useState } from "react";
import type { DataSet, Question } from "./types";
import QuestionBody from "./QuestionBody";
import ExplanationView from "./ExplanationView";
import LawNote from "./LawNote";
import { grade, slotOptions } from "./grade";
import { answerText } from "./QuestionDrill";
import { addMockRecord, clock, subjectScores, topShare, type Exams, type MockUnit } from "./mock";

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export default function MockDrill({
  unit,
  minutes,
  data,
  exams,
  onExit,
}: {
  unit: MockUnit;
  minutes: number;
  data: DataSet;
  exams: Exams | null;
  onExit: () => void;
}) {
  const questions = useMemo(() => [...data.questions].sort((a, b) => a.number - b.number), [data]);
  const sById = useMemo(() => new Map(data.statements.map((s) => [s.id, s])), [data]);
  const expById = useMemo(() => new Map(data.explanations.map((e) => [e.statement_id, e])), [data]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<Record<string, (number | null)[]>>({});
  const [done, setDone] = useState<{ earned: Map<string, number>; elapsedMs: number; timedOut: boolean } | null>(null);
  const endAt = startedAt + minutes * 60_000;
  const submitted = useRef(false);

  function submit(timedOut: boolean) {
    if (submitted.current) return;
    submitted.current = true;
    const earned = new Map(questions.map((q) => [q.id, grade(q, picks[q.id] ?? q.answer_slots.map(() => null)).earned]));
    const elapsedMs = Math.min(Date.now(), endAt) - startedAt;
    const total = [...earned.values()].reduce((a, b) => a + b, 0);
    const full = questions.reduce((a, q) => a + q.points, 0);
    addMockRecord({ key: unit.key, earned: total, full, elapsedMs, timedOut, at: new Date().toISOString() });
    setDone({ earned, elapsedMs, timedOut });
    window.scrollTo(0, 0);
  }

  // 残り時間：1秒ごとに描き直し、時間が来たら自動で採点する
  useEffect(() => {
    if (done) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endAt) submit(true);
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, endAt]);

  if (done) {
    return (
      <MockResult
        unit={unit}
        questions={questions}
        picks={picks}
        earned={done.earned}
        elapsedMs={done.elapsedMs}
        timedOut={done.timedOut}
        exams={exams}
        data={data}
        onRetry={() => {
          submitted.current = false;
          setPicks({});
          setI(0);
          setDone(null);
          const t = Date.now();
          setStartedAt(t);
          setNow(t);
        }}
        onExit={onExit}
      />
    );
  }

  const q = questions[i];
  const statements = q.statements.map((id) => sById.get(id)!);
  const mine = picks[q.id] ?? q.answer_slots.map(() => null);
  const answered = (x: Question) => (picks[x.id] ?? []).some((p) => p !== null);
  const left = endAt - now;

  function pick(k: number, v: number) {
    setPicks((p) => ({ ...p, [q.id]: mine.map((x, j) => (j === k ? (x === v ? null : v) : x)) }));
  }

  function confirmSubmit() {
    const blank = questions.filter((x) => !answered(x)).length;
    if (window.confirm(blank > 0 ? `まだ答えていない問が ${blank} 問あります。提出して採点しますか？` : "提出して採点しますか？")) submit(false);
  }

  function go(n: number) {
    setI(n);
    window.scrollTo(0, 0);
  }

  return (
    <section className="mock">
      <div className="toolbar">
        <button className="link" onClick={() => window.confirm("模試をやめますか？（記録は残りません）") && onExit()}>
          やめる
        </button>
        <span className={`mock-clock${left < 5 * 60_000 ? " warn" : ""}`} aria-label="残り時間">
          残り {clock(left)}
        </span>
        <button className="link" onClick={confirmSubmit}>
          提出する
        </button>
      </div>
      <div className="muted small">
        模試　{unit.exam === "yobi" ? "予備試験" : "司法試験"} {unit.era}（{unit.year}） {unit.name}　第{q.number}問（{i + 1} / {questions.length}）
      </div>
      <div className="mock-palette" role="group" aria-label="問の一覧">
        {questions.map((x, k) => (
          <button key={x.id} className={`${k === i ? "current" : ""}${answered(x) ? " answered" : ""}`} onClick={() => go(k)}>
            {x.number}
          </button>
        ))}
      </div>

      <QuestionBody q={q} statements={statements} showTruth={false} explanations={expById} />

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
              {slotOptions(q, k, statements).map((o) => (
                <button key={o.value} className={`opt${mine[k] === o.value ? " chosen" : ""}`} onClick={() => pick(k, o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="actionbar">
        <button className="secondary" disabled={i === 0} onClick={() => go(i - 1)}>
          前へ
        </button>
        {i + 1 < questions.length ? <button onClick={() => go(i + 1)}>次へ</button> : <button onClick={confirmSubmit}>提出する</button>}
      </div>
    </section>
  );
}

function MockResult({
  unit,
  questions,
  picks,
  earned,
  elapsedMs,
  timedOut,
  exams,
  data,
  onRetry,
  onExit,
}: {
  unit: MockUnit;
  questions: Question[];
  picks: Record<string, (number | null)[]>;
  earned: Map<string, number>;
  elapsedMs: number;
  timedOut: boolean;
  exams: Exams | null;
  data: DataSet;
  onRetry: () => void;
  onExit: () => void;
}) {
  const sById = new Map(data.statements.map((s) => [s.id, s]));
  const expById = new Map(data.explanations.map((e) => [e.statement_id, e]));
  const qexpById = new Map((data.question_explanations ?? []).map((e) => [e.question_id, e]));
  const names = new Map(unit.sets.map((s) => [s.subject, s.subject_name]));
  const scores = subjectScores(questions, earned);
  const total = scores.reduce((a, s) => a + s.earned, 0);
  const full = scores.reduce((a, s) => a + s.full, 0);
  const result = exams?.results[`${unit.exam}-${unit.year}`];
  const passRate = result ? result.pass_total / result.total_full : null;

  return (
    <section className="mock-result">
      <h1>模試の結果</h1>
      <div className="muted small">
        {unit.exam === "yobi" ? "予備試験" : "司法試験"} {unit.era}（{unit.year}） {unit.name}　かかった時間 {clock(elapsedMs)}
        {timedOut && "（時間切れで採点しました）"}
      </div>
      <div className="mock-total">
        <span className="big">{total}</span> / {full} 点<span className="muted">（{pct(total / full)}）</span>
      </div>

      {!result && <p className="muted small">この年度は、法務省の結果の資料が読めなかったため、平均点・合格点とは比べられません。</p>}
      <table className="mock-subjects">
        <thead>
          <tr>
            <th>科目</th>
            <th>得点</th>
            {result && <th>平均点</th>}
            {result?.min_line_rate !== undefined && <th>最低ライン</th>}
            {result?.distribution && <th>位置</th>}
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => {
            const r = result?.subjects[s.subject];
            const line = result?.min_line_rate !== undefined && r ? Math.ceil(r.full * result.min_line_rate) : null;
            const counts = result?.distribution?.[s.subject];
            const share = counts ? topShare(counts, s.earned) : null;
            return (
              <tr key={s.subject}>
                <td>{names.get(s.subject) ?? s.subject}</td>
                <td>
                  {s.earned} / {s.full}
                </td>
                {result && <td>{r ? `${r.avg} 点` : "—"}</td>}
                {line !== null && <td className={s.earned >= line ? "ok" : "ng"}>{s.earned >= line ? `${line}点以上 ✓` : `${line}点に届かず`}</td>}
                {result?.distribution && <td>{share !== null ? `上位 ${pct(share)}` : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {result && passRate !== null && (
        <p className="small mock-note">
          参考：合格点は {result.pass_total}点（{result.total_full}点満点、得点率 {pct(passRate)}）。あなたの得点率は {pct(total / full)}。
          {unit.exam === "yobi"
            ? "予備試験の合格点は一般教養科目を含む全科目の合計に対する点で、このアプリには一般教養科目がないため、そのままは比べられません。"
            : "合格点は3科目の合計に対する点です（各科目で最低ライン以上が必要）。"}
        </p>
      )}
      <p className="muted small">
        平均点は受験者（採点対象者）の平均。{result?.distribution && "位置は、受験者のうちその点数以上だった人の割合（上位○％）。"}
      </p>
      {result?.distribution === undefined && unit.exam === "shiho" && result && (
        <p className="muted small">この年度は得点別人員の資料が読めなかったため、受験者の中での位置は出していません。</p>
      )}
      <p className="muted small">
        出典：法務省「短答式試験の結果」（{unit.year}年）・令和{exams ? exams.times[unit.exam].year - 2018 : 8}年の受験案内（試験時間）。このアプリが PDF
        から読み取ったものです。
      </p>

      <div className="row">
        <button onClick={onRetry}>もう一度（同じ模試）</button>
        <button className="secondary" onClick={onExit}>
          戻る
        </button>
      </div>

      <h2>問ごと</h2>
      <ul className="mock-questions">
        {questions.map((q) => {
          const e = earned.get(q.id) ?? 0;
          const statements = q.statements.map((id) => sById.get(id)!);
          const mine = picks[q.id] ?? [];
          return (
            <li key={q.id} className={e === q.points ? "ok" : "ng"}>
              <details>
                <summary>
                  第{q.number}問　{e} / {q.points} 点
                  <span className="muted small">
                    　あなた：{q.answer_slots.map((_, k) => mine[k] ?? "—").join("・")}　正解：{q.unordered ? answerText(q, 0) : q.answer_slots.map((_, k) => answerText(q, k)).join("・")}
                  </span>
                </summary>
                <LawNote q={q} />
                <QuestionBody q={q} statements={statements} showTruth={true} explanations={expById} />
                {qexpById.has(q.id) && (
                  <details className="question-explanation" open>
                    <summary>この問の解説</summary>
                    <ExplanationView e={qexpById.get(q.id)!} />
                  </details>
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
