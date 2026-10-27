// 律のページ（T065）：立ち絵（押すとひとこと）・レベル・テーマ（着替え）・表情・セリフ帳・プロフィール。
// 律の言葉は ritsu/lines.json の決まった言葉だけ。声は押したときだけ鳴らす
import { useState } from "react";
import { back, navigate } from "../router";
import { progressNow } from "../progress";
import { characterImage, FACES, type Expression } from "../character";
import { Bubble } from "../Ritsu";
import { currentTheme, isRevealed, isUnlocked, nextTheme, setTheme, THEMES } from "../ritsu/themes";
import { ALL_LINES, lineText, linesOf, pickLine, playLine, type Line } from "../ritsu/lines";
import { CHAR_BASE } from "../character";
import { Progress } from "./common";

const FACE_NAMES: Record<Expression, string> = {
  normal: "ふつう",
  smile: "にっこり",
  think: "考え中",
  happy: "喜び",
  sad: "残念",
  sleepy: "眠そう",
  surprised: "びっくり",
  smug: "得意げ",
  jito: "ジト目",
};

const SCENE_NAMES: Record<string, string> = {
  tap: "おしゃべり",
  wear_knit: "ひだまりニットのとき",
  morning: "朝",
  day: "昼",
  evening: "夜",
  latenight: "深夜",
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  home_due: "復習があるとき",
  home_none: "復習がないとき",
  home_goal: "今日の目標を達成したとき",
  listen_start: "聞き流しのはじめ",
  listen_done: "聞き流しのおわり",
  result_good: "結果（よくできた）",
  result_mid: "結果（ふつう）",
  result_hard: "結果（むずかしかった）",
  levelup: "レベルアップ",
  theme: "着替え",
};

function sceneName(scene: string): string {
  if (scene.startsWith("subject_")) return "科目";
  if (scene.startsWith("reveal_")) return "お披露目";
  return SCENE_NAMES[scene] ?? scene;
}

export default function RitsuPage() {
  const p = progressNow();
  const [theme, setThemeState] = useState(() => currentTheme(p.level));
  const [face, setFace] = useState<Expression>("smile");
  const [said, setSaid] = useState<Line | undefined>(() => pickLine("tap", 1));
  const next = nextTheme(p.level);

  function say(l: Line | undefined) {
    if (!l) return;
    setSaid(l);
    setFace(l.face);
    playLine(l);
  }

  /** 押したときのひとこと：着ている衣装のときだけのセリフも混ぜる（3回に1回くらい） */
  function talk() {
    const wearLines = linesOf(`wear_${theme}`, p.level);
    if (wearLines.length && Math.random() < 0.35) say(wearLines[Math.floor(Math.random() * wearLines.length)]);
    else say(pickLine("tap", p.level));
  }

  function wear(id: string) {
    // まだお披露目を見ていない衣装は、お披露目から
    if (id !== "default" && !isRevealed(id)) {
      navigate({ name: "reveal", theme: id });
      return;
    }
    setTheme(id);
    setThemeState(id);
    if (id !== theme) say(pickLine("theme", p.level));
  }

  const open = ALL_LINES.filter((l) => l.level <= p.level);
  const scenes = [...new Set(open.map((l) => sceneName(l.scene)))];
  const locked = ALL_LINES.length - open.length;

  return (
    <section className="ritsu-page">
      <div className="toolbar">
        <button className="link" onClick={() => back({ name: "me" })}>
          ← 戻る
        </button>
      </div>

      <div className="vn-stage ritsu-stage">
        {said ? (
          <Bubble tail="right" className="vn-bubble">
            {lineText(said, { n: "いくつか" })}
          </Bubble>
        ) : (
          <span />
        )}
        <button className="ritsu-sprite-button" aria-label="律に話しかける" onClick={talk}>
          <img className="vn-sprite" src={characterImage("base", face, theme)} alt="" data-face={face} />
        </button>
      </div>

      <div className="card ritsu-level">
        <div className="level-row">
          <span className="ps-big">Lv.{p.level}</span>
          <span className="muted small">
            次のレベルまで {p.need - p.into}
            {next && `　・　Lv.${next.level} で「${next.name}」`}
          </span>
        </div>
        <Progress value={p.into / p.need} />
        <p className="muted small">律のレベルは、学習のレベルと同じです。初めての肢と、期限が来た復習で上がります。</p>
      </div>

      <h2>テーマ</h2>
      <div className="theme-grid">
        {THEMES.map((t) => {
          const ok = isUnlocked(t, p.level);
          return (
            <button
              key={t.id}
              className={`theme-tile${t.id === theme ? " chosen" : ""}${ok ? "" : " locked"}`}
              aria-pressed={t.id === theme}
              disabled={!ok}
              onClick={() => wear(t.id)}
            >
              <img src={characterImage("base", "smile", t.id)} alt="" loading="lazy" />
              <span>{ok ? t.name : `Lv.${t.level} で開く`}</span>
              {ok && t.id !== "default" && !isRevealed(t.id) && <span className="theme-new">NEW</span>}
            </button>
          );
        })}
      </div>

      {THEMES.some((t) => t.id !== "default" && isRevealed(t.id)) && (
        <>
          <h2>アルバム</h2>
          <div className="album-grid">
            {THEMES.filter((t) => t.id !== "default" && isRevealed(t.id)).map((t) => (
              <button key={t.id} className="album-tile" onClick={() => navigate({ name: "reveal", theme: t.id })}>
                <img src={`${CHAR_BASE}${t.id}/reveal.webp`} alt="" loading="lazy" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2>表情</h2>
      <div className="face-grid">
        {FACES.map((f) => (
          <button key={f} className={`face-tile${f === face ? " chosen" : ""}`} onClick={() => setFace(f)}>
            <img src={characterImage("chibi", f, theme)} alt="" loading="lazy" />
            <span>{FACE_NAMES[f]}</span>
          </button>
        ))}
      </div>

      <h2>セリフ帳</h2>
      <p className="muted small">
        開いたセリフ {open.length} 本{locked > 0 && `（あと ${locked} 本は、レベルが上がると開きます）`}。押すと律が言います。
      </p>
      {scenes.map((sc) => (
        <details key={sc} className="line-book">
          <summary>
            {sc}（{open.filter((l) => sceneName(l.scene) === sc).length}）
          </summary>
          <ul>
            {open
              .filter((l) => sceneName(l.scene) === sc)
              .map((l) => (
                <li key={l.id}>
                  <button className="link" onClick={() => say(l)}>
                    {l.voice === false ? "💬" : "🔊"} {lineText(l, { n: "N" })}
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ))}

      <h2>プロフィール</h2>
      <dl className="ritsu-profile">
        <dt>名前</dt>
        <dd>律（りつ）</dd>
        <dt>年齢</dt>
        <dd>15歳くらい</dd>
        <dt>好きなもの</dt>
        <dd>条文を読むこと・ココア・ふわふわの服</dd>
        <dt>性格</dt>
        <dd>のんびりで、ちょっと眠そう。むずかしい問題ほどわくわくする。むくれるとジト目</dd>
        <dt>いつも持っているもの</dt>
        <dd>小さな六法とマグカップ</dd>
      </dl>
    </section>
  );
}
