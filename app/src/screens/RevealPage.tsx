// 新しい衣装のお披露目（T065）：幕が開いて一枚絵、衣装名と「どんなときの衣装か」、律がお披露目のセリフを言う（押すと次へ）。
// 最後に着てもらうか選ぶ。見たことは端末に覚える（アルバムに並ぶ）。開いていないテーマは見せない
import { useEffect, useState } from "react";
import { back, navigate } from "../router";
import { progressNow } from "../progress";
import { CHAR_BASE } from "../character";
import { Bubble } from "../Ritsu";
import { isUnlocked, markRevealed, setTheme, themeById } from "../ritsu/themes";
import { linesOf, playLine } from "../ritsu/lines";

export default function RevealPage({ theme }: { theme: string }) {
  const t = themeById(theme);
  const level = progressNow().level;
  const lines = linesOf(`reveal_${theme}`, Infinity);
  const [k, setK] = useState(-1); // まだ幕が開いていない
  const ok = !!t && t.id !== "default" && isUnlocked(t, level);

  useEffect(() => {
    if (!ok) {
      navigate({ name: "ritsu" }, { replace: true });
      return;
    }
    markRevealed(theme);
    // 幕が開ききったら、最初のセリフ（お披露目は自分で開いた画面なので、声もここで流す）
    const timer = setTimeout(() => {
      setK(0);
      if (lines[0]) playLine(lines[0]);
    }, 1300);
    return () => clearTimeout(timer);
  }, [theme, ok]);

  if (!ok) return null;
  const line = k >= 0 ? lines[k] : undefined;
  const last = k >= lines.length - 1;

  function next() {
    if (k < 0 || last) return;
    setK(k + 1);
    playLine(lines[k + 1]);
  }

  return (
    <section className="reveal-page">
      <div className="toolbar">
        <button className="link" onClick={() => back({ name: "ritsu" })}>
          ← 戻る
        </button>
      </div>
      <p className="reveal-kicker">新しい衣装のお披露目</p>
      <h1 className="reveal-title">{t!.name}</h1>

      <button className="reveal-stage" aria-label="次のセリフ" onClick={next}>
        <img src={`${CHAR_BASE}${theme}/reveal.webp`} alt={`${t!.name}の律`} />
        <span className="curtain left" aria-hidden="true" />
        <span className="curtain right" aria-hidden="true" />
      </button>

      <div className="reveal-line">
        {line && (
          <Bubble tail="down" className="reveal-bubble">
            {line.text}
          </Bubble>
        )}
        {line && !last && <span className="muted small">絵を押すと次へ（{k + 1} / {lines.length}）</span>}
      </div>

      {t!.desc && <p className="reveal-desc">{t!.desc}</p>}

      {(last || lines.length === 0) && (
        <div className="row reveal-actions">
          <button
            onClick={() => {
              setTheme(theme);
              navigate({ name: "ritsu" });
            }}
          >
            着てもらう
          </button>
          <button className="secondary" onClick={() => navigate({ name: "ritsu" })}>
            いつもの服のまま
          </button>
        </div>
      )}
    </section>
  );
}
