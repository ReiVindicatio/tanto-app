// マイページ（T025・T024・T034）：学習の軌跡（ヒートマップ・累計の伸び）・科目ごと・まちがえた肢・アカウント・表示
import TrapSection from "./TrapSection";
import { useState } from "react";
import type { AuthClient } from "../auth";
import type { SyncedStore } from "../sync";
import type { CardRef, SubjectGroup } from "../data";
import AuthPanel, { DeleteData } from "../AuthBar";
import { navigate } from "../router";
import { currentState } from "../learning";
import { applyFilter, summarize } from "../history";
import { cumulative, heatLevel, heatmapWeeks, streak, totals, type HeatCell } from "../stats";
import { startStatements } from "../play";
import { subjectColor } from "../subjectsMeta";
import { getThemePref, setThemePref, type ThemePref } from "../theme";
import { cardsOf, Dot, Progress } from "./common";

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "端末に合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

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
          ホーム画面に追加すると、アプリのように全画面で開けて、通信がなくても解けます。iPhone
          では、しばらく開かなかったときに端末の記録が消されにくくなります。
        </p>
        <ul className="small">
          <li>iPhone（Safari）：下の共有ボタン → 「ホーム画面に追加」</li>
          <li>Android（Chrome）：右上のメニュー（︙）→ 「ホーム画面に追加」または「アプリをインストール」</li>
        </ul>
      </div>
    </>
  );
}

const WEEKS = 26;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** GitHub 風のヒートマップ：直近半年、1マス1日。たくさん解いた日ほど濃い（T034） */
function Heatmap({ weeks }: { weeks: HeatCell[][] }) {
  const cell = 11;
  const gap = 2;
  const left = 14;
  const top = 12;
  const w = left + weeks.length * (cell + gap);
  const h = top + 7 * (cell + gap);
  // 月の見出し：1日を含む週の上に出す。左端は、すぐ次の月の見出しと重ならないときだけ
  const hasFirst = (wk: HeatCell[]) => wk.find((c) => c.date.endsWith("-01"));
  const months: { x: number; label: string }[] = [];
  weeks.forEach((wk, i) => {
    const c = hasFirst(wk) ?? (i === 0 && !weeks.slice(1, 3).some(hasFirst) ? wk[0] : undefined);
    if (c) months.push({ x: left + i * (cell + gap), label: `${Number(c.date.slice(5, 7))}月` });
  });
  return (
    <svg className="heatmap" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`直近${weeks.length}週の学習の記録`}>
      {months.map((m) => (
        <text key={m.x} x={m.x} y={8} className="heat-label">
          {m.label}
        </text>
      ))}
      {[1, 3, 5].map((d) => (
        <text key={d} x={0} y={top + d * (cell + gap) + cell - 2} className="heat-label">
          {WEEKDAYS[d]}
        </text>
      ))}
      {weeks.map((wk, i) =>
        wk.map((c, d) =>
          c.future ? null : (
            <rect
              key={c.date}
              x={left + i * (cell + gap)}
              y={top + d * (cell + gap)}
              width={cell}
              height={cell}
              rx={2}
              className={`heat-${heatLevel(c.answered)}`}
            >
              <title>{`${c.date}：${c.answered}肢`}</title>
            </rect>
          ),
        ),
      )}
    </svg>
  );
}

/** 累計の回答数の伸び（climb chart）：最初に解いた日から今日まで（T034） */
function ClimbChart({ points }: { points: { date: string; total: number }[] }) {
  if (points.length === 0) return null;
  // 記録が1日だけのときは、その日の累計の高さで横に引く（1点だけだと右下がりの三角になる）
  if (points.length === 1) points = [points[0], points[0]];
  const max = Math.max(...points.map((p) => p.total), 1);
  const n = Math.max(points.length - 1, 1);
  const xy = points.map((p, i) => [(i / n) * 100, 40 - (p.total / max) * 36] as const);
  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <>
      <svg className="climb" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label={`累計 ${max} 肢`}>
        <path d={`${line} L100,40 L0,40 Z`} className="climb-area" />
        <path d={line} className="climb-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="daily-axis muted small">
        <span>{points[0].date.slice(5).replace("-", "/")}</span>
        <span>累計 {max.toLocaleString()} 肢</span>
        <span>今日</span>
      </div>
    </>
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

  const allSets = groups.flatMap((g) => g.sets);
  const wrongTotal = applyFilter(cardsOf(allSets, cardIds), "wrong").length;

  return (
    <section>
      <h1>マイページ</h1>

      <h2>学習の軌跡</h2>
      <div className="card">
        <div className="today-stats">
          <span>
            連続 <strong className="big">{streak(state.daily)}</strong> 日
          </span>
          <span>
            累計 <strong className="big">{t.answered.toLocaleString()}</strong> 肢
          </span>
          <span>
            <strong className="big">{t.days}</strong> 日学習
          </span>
        </div>
        <Heatmap weeks={heatmapWeeks(state.daily, WEEKS)} />
        <div className="heat-legend muted small">
          <span>直近半年</span>
          <span className="heat-scale">
            少ない
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`heat-box heat-${l}`} />
            ))}
            多い
          </span>
        </div>
        <ClimbChart points={cumulative(state.daily)} />
      </div>

      <h2>科目ごと</h2>
      <div className="list">
        {groups.map((g) => {
          const ids = cardsOf(g.sets, cardIds).map((c) => c.id);
          const total = cardIds.size ? ids.length : g.sets.reduce((n, s) => n + s.statement_cards, 0); // 名寄せ後の枚数
          const st = summarize(ids);
          return (
            <div className="list-row subject-stat" key={g.subject}>
              <Dot subject={g.subject} />
              <div className="grow">
                <div className="subject-stat-head">
                  <span className="row-title">{g.name}</span>
                  <span className="small">{total ? Math.round((st.answered / total) * 100) : 0}%</span>
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

      <TrapSection sets={allSets} pool={cardsOf(allSets, cardIds)} />

      <InstallHint />

      <h2>アカウント</h2>
      <div className="card">
        {auth && sync ? <AuthPanel auth={auth} sync={sync} /> : <p className="muted small">ログインは使えません</p>}
        {sync && <DeleteData sync={sync} />}
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

      <p className="legal-links small">
        <button className="link small" onClick={() => navigate({ name: "terms" })}>
          利用規約
        </button>
        <button className="link small" onClick={() => navigate({ name: "privacy" })}>
          プライバシーポリシー
        </button>
      </p>
    </section>
  );
}
