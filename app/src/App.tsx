import { useEffect, useState } from "react";
import type { Attribution, DataSet, SetInfo, Statement } from "./types";
import StatementDrill from "./StatementDrill";
import QuestionDrill from "./QuestionDrill";
import Footer from "./Footer";
import { applyFilter, getHistory, summarize, type Filter } from "./history";
import { MINPO_REFORM_YEAR } from "./LawNote";
import { shuffle } from "./shuffle";
import { buildSession, dueSummary, NEW_PER_DAY } from "./srs";

type Screen =
  | { kind: "home" }
  | { kind: "statements"; title: string; data: DataSet; cards: Statement[]; examName: string; subjectName: string }
  | { kind: "questions"; info: SetInfo; data: DataSet };

const cache = new Map<string, DataSet>();

async function loadSet(info: SetInfo): Promise<DataSet> {
  if (!cache.has(info.file)) {
    cache.set(info.file, await fetch(`${import.meta.env.BASE_URL}data/${info.file}`).then((r) => r.json()));
  }
  return cache.get(info.file)!;
}

function merge(sets: DataSet[]): DataSet {
  return {
    attribution: {
      ...sets[0].attribution,
      source_pdfs: [...new Set(sets.flatMap((d) => d.attribution.source_pdfs))],
    },
    exam: sets[0].exam,
    subject: sets[0].subject,
    questions: sets.flatMap((d) => d.questions),
    statements: sets.flatMap((d) => d.statements),
    explanations: sets.flatMap((d) => d.explanations),
  };
}

const FILTER_LABELS: Record<Filter, string> = { all: "すべて", unanswered: "未回答だけ", wrong: "前回まちがえたものだけ" };

export default function App() {
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [filter, setFilter] = useState<Filter>("all");
  const [includePreReform, setIncludePreReform] = useState(false);
  const [ids, setIds] = useState<Map<string, { id: string; question_id: string }[]>>(new Map()); // 束 → 肢カード（集計用）

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => r.json())
      .then((d: { sets: SetInfo[] }) => setSets(d.sets))
      .catch((e) => setError(String(e)));
  }, []);

  // 履歴の集計のため、ホームに戻るたびに各束の肢 ID を読み込む（キャッシュ済み）
  useEffect(() => {
    if (!sets || screen.kind !== "home") return;
    Promise.all(
      sets.map(async (s) => [s.id, (await loadSet(s)).statements.filter((x) => x.truth_at_exam && !x.review_flag).map((x) => ({ id: x.id, question_id: x.question_id }))] as const),
    ).then(
      (pairs) => setIds(new Map(pairs)),
    );
  }, [sets, screen.kind]);

  const subjects = groupBySubject(sets ?? []);
  const history = getHistory();

  async function openStatements(infos: SetInfo[], title: string) {
    const data = merge(await Promise.all(infos.map(loadSet)));
    let cards = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
    cards = applyFilter(cards, filter, history);
    if (infos.length > 1) cards = shuffle(cards);
    setScreen({ kind: "statements", title, data, cards, examName: infos[0].exam_name, subjectName: infos[0].subject_name });
  }

  async function openReview(infos: SetInfo[], title: string) {
    const data = merge(await Promise.all(infos.map(loadSet)));
    // 新規カードは新しい年度から順に入れる（pool は新しい年度が先）
    const pool = data.statements.filter((s) => s.truth_at_exam && !s.review_flag);
    const { cards } = buildSession(pool);
    setScreen({ kind: "statements", title, data, cards, examName: infos[0].exam_name, subjectName: infos[0].subject_name });
  }

  async function openQuestions(info: SetInfo) {
    setScreen({ kind: "questions", info, data: await loadSet(info) });
  }

  const home = () => setScreen({ kind: "home" });
  const attribution: Attribution | undefined =
    screen.kind === "home" ? sets?.[0]?.attribution : screen.data.attribution;

  return (
    <div className="page">
      <header className="appbar">
        <button className="link" onClick={home}>
          短答一問一答<span className="muted">（仮称・非公式）</span>
        </button>
      </header>
      <main>
        {screen.kind === "home" && (
          <section>
            <h1>どれを解く？</h1>
            {error && <p className="error">データを読めませんでした：{error}</p>}
            {!sets && !error && <p className="muted">読み込み中…</p>}
            {sets && (
              <div className="row small">
                肢カードの絞り込み：
                {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                  <button key={f} className={`opt ${filter === f ? "chosen" : ""}`} onClick={() => setFilter(f)}>
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
            )}
            {subjects.map(([subjectName, infos]) => {
              const isMinpo = infos[0].subject === "minpo";
              const pool = infos.filter((s) => includePreReform || !isMinpo || s.exam.year >= MINPO_REFORM_YEAR);
              const poolItems = pool.flatMap((s) => ids.get(s.id) ?? []);
              const st = summarize(poolItems.map((x) => x.id), history);
              const srs = dueSummary(poolItems);
              return (
                <div className="subject" key={subjectName}>
                  <h2>
                    {infos[0].exam_name} {subjectName}
                  </h2>
                  <div className="set review">
                    <div className="set-title">今日の復習（FSRS）</div>
                    <div className="muted small">
                      期限が来た肢 {srs.due}枚・今日の新規の残り {srs.newLeft}枚（1日{NEW_PER_DAY}枚まで）。同じ問の肢は1回に1枚まで
                    </div>
                    <div className="row">
                      <button disabled={pool.length === 0} onClick={() => openReview(pool, `${subjectName} 今日の復習`)}>
                        復習をはじめる
                      </button>
                    </div>
                  </div>
                  {infos.length > 1 && (
                    <div className="set">
                      <div className="set-title">全年度から（シャッフル）</div>
                      <div className="muted small">
                        {pool.length}年度・肢カード {pool.reduce((n, s) => n + s.statement_cards, 0)}枚・回答済み {st.answered}枚（前回正解{" "}
                        {st.lastCorrect}枚）
                      </div>
                      {isMinpo && (
                        <label className="small">
                          <input type="checkbox" checked={includePreReform} onChange={(e) => setIncludePreReform(e.target.checked)} />{" "}
                          {MINPO_REFORM_YEAR}年より前（債権法改正の施行前）の出題も含める
                        </label>
                      )}
                      <div className="row">
                        <button disabled={pool.length === 0} onClick={() => openStatements(pool, `${subjectName} 全年度`)}>
                          肢で解く（○×）
                        </button>
                      </div>
                    </div>
                  )}
                  <details open={infos.length === 1}>
                    <summary>年度ごと</summary>
                    {infos.map((s) => {
                      const y = summarize((ids.get(s.id) ?? []).map((x) => x.id), history);
                      return (
                        <div className="set" key={s.id}>
                          <div className="set-title">
                            {s.exam.era}（{s.exam.year}）
                          </div>
                          <div className="muted small">
                            {s.questions}問・肢カード {s.statement_cards}枚・解説 {s.explanations}肢・回答済み {y.answered}枚
                          </div>
                          <div className="row">
                            <button disabled={s.statement_cards === 0} onClick={() => openStatements([s], `${s.exam.era} ${subjectName}`)}>
                              肢で解く（○×）
                            </button>
                            <button className="secondary" onClick={() => openQuestions(s)}>
                              問で解く（本番形式）
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </details>
                </div>
              );
            })}
          </section>
        )}
        {screen.kind === "statements" && (
          <StatementDrill
            title={screen.title}
            data={screen.data}
            cards={screen.cards}
            examName={screen.examName}
            subjectName={screen.subjectName}
            onExit={home}
          />
        )}
        {screen.kind === "questions" && <QuestionDrill info={screen.info} data={screen.data} onExit={home} />}
      </main>
      <Footer attribution={attribution} />
    </div>
  );
}

function groupBySubject(sets: SetInfo[]): [string, SetInfo[]][] {
  const m = new Map<string, SetInfo[]>();
  for (const s of sets) {
    const k = s.subject_name;
    m.set(k, [...(m.get(k) ?? []), s]);
  }
  // 新しい年度を上に
  return [...m.entries()].map(([k, v]) => [k, [...v].sort((a, b) => b.exam.year - a.exam.year)]);
}
