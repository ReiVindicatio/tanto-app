// 科目の画面（T025）：今日の復習・全年度から・絞り込み・年度の一覧（折りたたまずに並べる）
// 予備・司法の両方がある科目は、年度の一覧と「全年度から」を試験で切り替える。今日の復習は両方から（決定018）
import { useState } from "react";
import { EXAM_SHORT, type CardRef, type SubjectGroup } from "../data";
import { summarize, type Filter } from "../history";
import { MINPO_REFORM_YEAR } from "../LawNote";
import { dueSummary, NEW_PER_DAY } from "../srs";
import { back } from "../router";
import { startQuestions, startReview, startStatements } from "../play";
import { subjectColor } from "../subjectsMeta";
import { cardsOf, Progress, poolOf } from "./common";
import TopicSection from "./TopicSection";

const FILTER_LABELS: Record<Filter, string> = { all: "すべて", unanswered: "未回答だけ", wrong: "前回まちがえたものだけ" };

export default function SubjectPage({
  group,
  cardIds,
  filter,
  setFilter,
  includePreReform,
  setIncludePreReform,
}: {
  group: SubjectGroup;
  cardIds: Map<string, CardRef[]>;
  filter: Filter;
  setFilter: (f: Filter) => void;
  includePreReform: boolean;
  setIncludePreReform: (v: boolean) => void;
}) {
  const g = group;
  const [exam, setExam] = useState(g.exams[0]);
  const color = subjectColor(g.subject);
  const isMinpo = g.subject === "minpo";
  const reviewPool = poolOf(g, includePreReform);
  const srs = dueSummary(cardsOf(reviewPool, cardIds));
  const examSets = g.sets.filter((s) => s.exam.type === exam);
  const pool = reviewPool.filter((s) => s.exam.type === exam);
  const poolCards = cardsOf(pool, cardIds);
  const st = summarize(poolCards.map((c) => c.id));
  const examLabel = g.exams.length > 1 ? `${EXAM_SHORT[exam]}の` : "";

  return (
    <section className="subject-page" style={{ ["--subject" as string]: color }}>
      <div className="toolbar">
        <button className="link" onClick={() => back({ name: "subjects" })}>
          ← 科目
        </button>
      </div>
      <h1 className="subject-title">
        <span className="dot" style={{ background: color }} aria-hidden="true" />
        {g.name}
      </h1>

      <div className="set review">
        <div className="set-title">今日の復習</div>
        <div className="muted small">
          期限が来た肢 {srs.due}枚・今日の新規の残り {srs.newLeft}枚（1日{NEW_PER_DAY}枚まで）。同じ問の肢は1回に1枚まで
        </div>
        <div className="row">
          <button disabled={reviewPool.length === 0} onClick={() => startReview(reviewPool, `${g.name} 今日の復習`)}>
            復習をはじめる
          </button>
        </div>
      </div>

      <TopicSection subject={g.subject} name={g.name} pool={reviewPool} />

      {g.exams.length > 1 && (
        <div className="segmented exam-switch" role="group" aria-label="試験">
          {g.exams.map((e) => (
            <button key={e} className={exam === e ? "chosen" : ""} aria-pressed={exam === e} onClick={() => setExam(e)}>
              {EXAM_SHORT[e]}（{g.sets.filter((s) => s.exam.type === e).length}年度）
            </button>
          ))}
        </div>
      )}

      {examSets.length > 1 && (
        <div className="set">
          <div className="set-title">{examLabel}全年度から（シャッフル）</div>
          <div className="muted small">
            {pool.length}年度・肢カード {cardIds.size ? poolCards.length : pool.reduce((n, s) => n + s.statement_cards, 0)}
            枚・回答済み {st.answered}枚（前回正解 {st.lastCorrect}枚）
          </div>
          {isMinpo && (
            <label className="small check">
              <input type="checkbox" checked={includePreReform} onChange={(e) => setIncludePreReform(e.target.checked)} />{" "}
              {MINPO_REFORM_YEAR}年より前（債権法改正の施行前）の出題も含める
            </label>
          )}
          <div className="row">
            <button disabled={pool.length === 0} onClick={() => startStatements(pool, `${g.name} ${examLabel}全年度`, filter)}>
              肢で解く（○×）
            </button>
          </div>
        </div>
      )}

      <div className="filter">
        <div className="muted small">肢カードの絞り込み</div>
        <div className="segmented" role="group" aria-label="肢カードの絞り込み">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button key={f} className={filter === f ? "chosen" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <h2>年度</h2>
      <p className="muted small">肢で解く＝1肢ずつ○×で答える。問で解く＝本番と同じ形式で1問ずつ答えて採点する。</p>
      <div className="years">
        {examSets.map((s) => {
          const y = summarize((cardIds.get(s.id) ?? []).map((x) => x.id));
          return (
            <div className="set year" key={s.id}>
              <div className="year-line">
                <div className="grow">
                  <div className="set-title">
                    {g.exams.length > 1 && `${EXAM_SHORT[s.exam.type]} `}
                    {s.exam.era}（{s.exam.year}）
                  </div>
                  <div className="muted small">
                    {s.questions}問・肢 {s.statement_cards}・{s.explanations > 0 ? `解説 ${s.explanations}` : "解説なし"}
                    ・回答済み {y.answered}
                  </div>
                </div>
                <div className="year-actions">
                  <button
                    disabled={s.statement_cards === 0}
                    onClick={() =>
                      startStatements(
                        [s],
                        `${g.exams.length > 1 ? EXAM_SHORT[s.exam.type] + " " : ""}${s.exam.era} ${g.name}`,
                        filter,
                      )
                    }
                  >
                    肢で解く
                  </button>
                  <button className="secondary" onClick={() => startQuestions(s)}>
                    問で解く
                  </button>
                </div>
              </div>
              <Progress value={s.statement_cards ? y.answered / s.statement_cards : 0} color={color} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
