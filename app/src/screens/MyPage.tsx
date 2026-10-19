// マイページ（T025・T024）：学習の記録・科目ごと・まちがえた肢・アカウント・表示
import { useState } from "react";
import type { AuthClient } from "../auth";
import type { SyncedStore } from "../sync";
import type { CardRef, SubjectGroup } from "../data";
import AuthPanel from "../AuthBar";
import { currentState } from "../learning";
import { applyFilter, summarize } from "../history";
import { lastDays, streak, totals } from "../stats";
import { startStatements } from "../play";
import { subjectColor } from "../subjectsMeta";
import { getThemePref, setThemePref, type ThemePref } from "../theme";
import { cardsOf, Dot, Progress } from "./common";

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "端末に合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

const DAYS = 14;

/** ホーム画面から（アプリとして）開いているか */
function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** ホーム画面に追加する手順（T030）。ホーム画面から開いているときは出さない */
function InstallHint() {
  if (isStandalone()) return null;
  return (
    <>
      <h2>ホーム画面に追加</h2>
      <div className="card install-hint">
        <p className="small">
          ホーム画面に追加すると、アプリのように全画面で開けて、通信がなくても解けます。iPhone では、しばらく開かなかったときに端末の記録が消されにくくなります。
        </p>
        <ul className="small">
          <li>iPhone（Safari）：下の共有ボタン → 「ホーム画面に追加」</li>
          <li>Android（Chrome）：右上のメニュー（︙）→ 「ホーム画面に追加」または「アプリをインストール」</li>
        </ul>
      </div>
    </>
  );
}

/** 直近の日ごとの回答数の棒（正解の分を緑で重ねる） */
function DailyBars({ days }: { days: { date: string; answered: number; correct: number }[] }) {
  const max = Math.max(10, ...days.map((d) => d.answered));
  const w = 100 / days.length;
  return (
    <svg
      className="daily-bars"
      viewBox="0 0 100 44"
      preserveAspectRatio="none"
      role="img"
      aria-label={`直近${days.length}日の回答数`}
    >
      {days.map((d, i) => {
        const h = (d.answered / max) * 36;
        const hc = (d.correct / max) * 36;
        return (
          <g key={d.date}>
            <rect x={i * w + w * 0.15} y={38 - h} width={w * 0.7} height={h} fill="var(--border)" rx="0.8">
              <title>{`${d.date}：${d.answered}肢（正解 ${d.correct}）`}</title>
            </rect>
            <rect x={i * w + w * 0.15} y={38 - hc} width={w * 0.7} height={hc} fill="var(--ok)" rx="0.8" />
          </g>
        );
      })}
      <line x1="0" y1="38.2" x2="100" y2="38.2" stroke="var(--border-subtle)" strokeWidth="0.3" />
    </svg>
  );
}

export default function MyPage({
  auth,
  sync,
  groups,
  cardIds,
}: {
  auth?: AuthClient;
  sync?: SyncedStore;
  groups: SubjectGroup[];
  cardIds: Map<string, CardRef[]>;
}) {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const state = currentState();
  const t = totals(state.daily);
  const days = lastDays(state.daily, DAYS);
  const allSets = groups.flatMap((g) => g.sets);
  const wrongTotal = applyFilter(cardsOf(allSets, cardIds), "wrong").length;

  return (
    <section>
      <h1>マイページ</h1>

      <h2>学習の記録</h2>
      <div className="card">
        <div className="today-stats">
          <span>
            連続 <strong className="big">{streak(state.daily)}</strong> 日
          </span>
          <span>
            <strong className="big">{t.answered.toLocaleString()}</strong> 回答
          </span>
          <span>
            正答率 <strong className="big">{t.answered ? Math.round((t.correct / t.answered) * 100) : 0}</strong>%
          </span>
        </div>
        <DailyBars days={days} />
        <div className="daily-axis muted small">
          <span>{days[0].date.slice(5).replace("-", "/")}</span>
          <span>直近{DAYS}日（緑＝正解）</span>
          <span>今日</span>
        </div>
        <p className="muted small">
          学習した日 {t.days}日・答えた肢 {state.history.size.toLocaleString()}枚
        </p>
      </div>

      <h2>科目ごと</h2>
      <div className="list">
        {groups.map((g) => {
          const ids = cardsOf(g.sets, cardIds).map((c) => c.id);
          const total = g.sets.reduce((n, s) => n + s.statement_cards, 0);
          const st = summarize(ids);
          return (
            <div className="list-row subject-stat" key={g.subject}>
              <Dot subject={g.subject} />
              <div className="grow">
                <div className="subject-stat-head">
                  <span className="row-title">{g.name}</span>
                  <span className="small">正答率 {st.answered ? `${Math.round((st.lastCorrect / st.answered) * 100)}%` : "—"}</span>
                </div>
                <Progress value={total ? st.answered / total : 0} color={subjectColor(g.subject)} />
                <div className="muted small">
                  回答済み {st.answered.toLocaleString()} / {total.toLocaleString()}枚
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small">正答率は、答えた肢のうち前回正解した肢の割合です。</p>

      <h2>まちがえた肢</h2>
      <div className="card">
        <p className="wrong-total">
          前回まちがえた肢 <strong className="big">{wrongTotal}</strong> 枚
        </p>
        <button className="wide" disabled={wrongTotal === 0} onClick={() => startStatements(allSets, "まちがえた肢", "wrong")}>
          まちがえた肢をまとめて解く
        </button>
        <p className="muted small">
          全科目・全年度から、前回まちがえた肢だけをシャッフルして出します。正解すると一覧から外れます。
        </p>
      </div>

      <InstallHint />

      <h2>アカウント</h2>
      <div className="card">
        {auth && sync ? <AuthPanel auth={auth} sync={sync} /> : <p className="muted small">ログインは使えません</p>}
      </div>

      <h2>表示</h2>
      <div className="card">
        <div className="muted small">テーマ</div>
        <div className="segmented" role="group" aria-label="テーマ">
          {THEMES.map((th) => (
            <button
              key={th.value}
              className={theme === th.value ? "chosen" : ""}
              aria-pressed={theme === th.value}
              onClick={() => {
                setThemePref(th.value);
                setTheme(th.value);
              }}
            >
              {th.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
