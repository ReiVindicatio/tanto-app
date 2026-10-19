// マイページ（T025）：アカウント・表示・累計の記録。学習の記録の詳細は T024 で広げる
import { useState } from "react";
import type { AuthClient } from "../auth";
import type { SyncedStore } from "../sync";
import AuthPanel from "../AuthBar";
import { currentState } from "../learning";
import { getThemePref, setThemePref, type ThemePref } from "../theme";

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "端末に合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

export default function MyPage({ auth, sync }: { auth?: AuthClient; sync?: SyncedStore }) {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const state = currentState();
  let answered = 0;
  let correct = 0;
  for (const d of state.daily.values()) {
    answered += d.answered;
    correct += d.correct;
  }

  return (
    <section>
      <h1>マイページ</h1>

      <h2>アカウント</h2>
      <div className="card">{auth && sync ? <AuthPanel auth={auth} sync={sync} /> : <p className="muted small">ログインは使えません</p>}</div>

      <h2>これまでの記録</h2>
      <div className="card">
        <div className="today-stats">
          <span>
            <strong className="big">{answered.toLocaleString()}</strong> 回答
          </span>
          <span>
            <strong className="big">{state.history.size.toLocaleString()}</strong> 肢
          </span>
          <span>
            正答率 <strong className="big">{answered ? Math.round((correct / answered) * 100) : 0}</strong>%
          </span>
        </div>
        <p className="muted small">学習日ごとの記録・苦手な肢の一覧は、これから足します。</p>
      </div>

      <h2>表示</h2>
      <div className="card">
        <div className="muted small">テーマ</div>
        <div className="segmented" role="group" aria-label="テーマ">
          {THEMES.map((t) => (
            <button
              key={t.value}
              className={theme === t.value ? "chosen" : ""}
              aria-pressed={theme === t.value}
              onClick={() => {
                setThemePref(t.value);
                setTheme(t.value);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
