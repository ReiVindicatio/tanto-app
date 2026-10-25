// 模試を選ぶ画面（T028）：試験・年度・科目群（司法は科目）を選ぶ。過去の模試の点数も並べる
import { useEffect, useState } from "react";
import type { SetInfo } from "../types";
import { startMock } from "../play";
import { getMockHistory, loadExams, minutesOf, mockUnits, SHIHO_FIRST_YEAR, type Exams } from "../mock";

const EXAMS = [
  { id: "yobi", name: "予備試験" },
  { id: "shiho", name: "司法試験" },
];
// 選んだ試験は、解いて戻ってきても保つ
let chosenExam = "yobi";

export default function MockHome({ sets }: { sets: SetInfo[] }) {
  const [exams, setExams] = useState<Exams | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExamState] = useState(chosenExam);
  const setExam = (e: string) => {
    chosenExam = e;
    setExamState(e);
  };
  useEffect(() => {
    loadExams().then(setExams, (e) => setError(String(e)));
  }, []);

  const units = mockUnits(sets).filter((u) => u.exam === exam);
  const years = [...new Set(units.map((u) => u.year))];
  const history = getMockHistory();
  const last = (key: string) => history.filter((h) => h.key === key).at(-1);
  const guideYear = exams?.times[exam]?.year;

  return (
    <section className="mock-home">
      <h1>模試（本番の時間で解く）</h1>
      <p className="small">
        本番と同じ時間で、{exam === "yobi" ? "科目群" : "科目"}の問を通しで解きます。答えはその場では採点せず、提出したとき（時間が来たら自動で）まとめて採点し、受験者の平均点などと比べます。
      </p>
      <p className="muted small">
        試験時間は令和{guideYear ? guideYear - 2018 : 8}年の受験案内によります（それより前の年度の受験案内は法務省のサイトに残っていないため、どの年度も同じ時間で解きます）。
        {exam === "shiho" && `司法試験は、3科目になった平成27年（${SHIHO_FIRST_YEAR}年）から。`}
        模試の答えは、復習の記録には入れません。
      </p>
      {error && <p className="error small">試験の資料を読めませんでした：{error}</p>}

      <div className="segmented" role="group" aria-label="試験">
        {EXAMS.map((e) => (
          <button key={e.id} className={exam === e.id ? "chosen" : ""} aria-pressed={exam === e.id} onClick={() => setExam(e.id)}>
            {e.name}
          </button>
        ))}
      </div>

      {exams &&
        years.map((y) => {
          const us = units.filter((u) => u.year === y);
          return (
            <div key={y} className="set mock-year">
              <div className="set-title">
                {us[0].era}（{y}）
              </div>
              <div className="mock-units">
                {us.map((u) => {
                  const m = minutesOf(exams, u);
                  const h = last(u.key);
                  return (
                    <button key={u.key} className="secondary" disabled={m === null} onClick={() => m !== null && startMock(u, m, exams)}>
                      <span>{u.name}</span>
                      <span className="muted small">
                        {m !== null ? `${m}分` : "時間の資料なし"}
                        {h && `・前回 ${h.earned}/${h.full}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </section>
  );
}
