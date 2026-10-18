import { useEffect, useState } from "react";
import type { DataSet, SetInfo } from "./types";
import StatementDrill from "./StatementDrill";
import QuestionDrill from "./QuestionDrill";
import Footer from "./Footer";

type Screen = { kind: "home" } | { kind: "statements" | "questions"; info: SetInfo; data: DataSet };

export default function App() {
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => r.json())
      .then((d: { sets: SetInfo[] }) => setSets(d.sets))
      .catch((e) => setError(String(e)));
  }, []);

  async function open(info: SetInfo, kind: "statements" | "questions") {
    const data: DataSet = await fetch(`${import.meta.env.BASE_URL}data/${info.file}`).then((r) => r.json());
    setScreen({ kind, info, data });
  }

  const home = () => setScreen({ kind: "home" });

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
            {sets?.map((s) => (
              <div className="set" key={s.id}>
                <div className="set-title">
                  {s.exam_name} {s.exam.era}（{s.exam.year}） {s.subject_name}
                </div>
                <div className="muted small">
                  {s.questions}問・肢カード {s.statement_cards}枚・解説 {s.explanations}肢
                </div>
                <div className="row">
                  <button disabled={s.statement_cards === 0} onClick={() => open(s, "statements")}>
                    肢で解く（○×）
                  </button>
                  <button className="secondary" onClick={() => open(s, "questions")}>
                    問で解く（本番形式）
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        {screen.kind === "statements" && <StatementDrill info={screen.info} data={screen.data} onExit={home} />}
        {screen.kind === "questions" && <QuestionDrill info={screen.info} data={screen.data} onExit={home} />}
      </main>
      <Footer attribution={screen.kind === "home" ? sets?.[0]?.attribution : screen.data.attribution} />
    </div>
  );
}
