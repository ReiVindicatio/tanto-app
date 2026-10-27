// 律のページ（T065）：上に背景つきの立ち絵（押すとひとこと・スクロールしても上に残る）、下はタブ（衣装・表情・背景・セリフ・アルバム・プロフィール）。
// 律の言葉は ritsu/lines.json の決まった言葉だけ。声は押したときだけ鳴らす
import { useEffect, useRef, useState } from "react";
import { back, navigate } from "../router";
import { progressNow } from "../progress";
import { characterImage, FACES, type Expression } from "../character";
import { Bubble } from "../Ritsu";
import { BACKGROUNDS, bgFor, chosenBg, currentTheme, isRevealed, isUnlocked, nextTheme, setBg, setTheme, THEMES } from "../ritsu/themes";
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

type Tab = "theme" | "face" | "bg" | "lines" | "album" | "profile";
const TABS: { id: Tab; name: string }[] = [
  { id: "theme", name: "衣装" },
  { id: "face", name: "表情" },
  { id: "bg", name: "背景" },
  { id: "lines", name: "セリフ" },
  { id: "album", name: "アルバム" },
  { id: "profile", name: "プロフィール" },
];

const BG_BASE = `${import.meta.env.BASE_URL}chars/bg/`;
/** しばらく触らないと眠そうになる（ミリ秒） */
const DOZE_AFTER = 25000;

export default function RitsuPage() {
  const p = progressNow();
  const [theme, setThemeState] = useState(() => currentTheme(p.level));
  const [bg, setBgState] = useState(chosenBg);
  const [face, setFace] = useState<Expression>("smile");
  const [said, setSaid] = useState<Line | undefined>(() => pickLine("tap", 1));
  const [tab, setTab] = useState<Tab>("theme");
  const [bump, setBump] = useState(0); // 押したときの小さな跳ね（描き直しのきっかけ）
  const next = nextTheme(p.level);
  const doze = useRef<number | undefined>(undefined);

  // しばらく触らないと眠そうな顔になる（押すと起きる）
  function wake() {
    window.clearTimeout(doze.current);
    doze.current = window.setTimeout(() => {
      setFace("sleepy");
      setSaid(undefined);
    }, DOZE_AFTER);
  }
  useEffect(() => {
    wake();
    return () => window.clearTimeout(doze.current);
  }, []);

  function say(l: Line | undefined) {
    if (!l) return;
    setSaid(l);
    setFace(l.face);
    setBump((n) => n + 1);
    playLine(l);
    wake();
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

  function chooseBg(id: string) {
    setBg(id);
    setBgState(id);
    wake();
  }

  const open = ALL_LINES.filter((l) => l.level <= p.level);
  const scenes = [...new Set(open.map((l) => sceneName(l.scene)))];
  const locked = ALL_LINES.length - open.length;
  const revealed = THEMES.filter((t) => t.id !== "default" && isRevealed(t.id));

  return (
    <section className="ritsu-page">
      <div className="toolbar">
        <button className="link" onClick={() => back({ name: "me" })}>
          ← 戻る
        </button>
        <span />
        <span />
      </div>

      {/* 立ち絵：背景つきで上に残す（スクロールしても、選んだ衣装・表情・背景がすぐ見える） */}
      <div className="ritsu-stage" style={{ backgroundImage: `url(${BG_BASE}${bgFor(theme, bg)}.webp)` }}>
        {said && (
          <Bubble tail="right" className="vn-bubble stage-bubble">
            {lineText(said, { n: "いくつか" })}
          </Bubble>
        )}
        <button className="ritsu-sprite-button" aria-label="律に話しかける" onClick={talk}>
          <img
            key={bump}
            className={`vn-sprite${bump ? " bump" : ""}${face === "sleepy" ? " dozing" : ""}`}
            src={characterImage("base", face, theme)}
            alt=""
            data-face={face}
          />
        </button>
      </div>
      <div className="ritsu-level">
        <div className="ritsu-level-row">
          <span className="lv">Lv.{p.level}</span>
          <div className="grow">
            <Progress value={p.into / p.need} />
          </div>
          <span className="muted small">次まで {p.need - p.into}</span>
        </div>
        {next && <div className="muted small">Lv.{next.level} で「{next.name}」が開きます</div>}
      </div>

      <div className="ritsu-tabs" role="tablist">
        {TABS.filter((t) => t.id !== "album" || revealed.length > 0).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "chosen" : ""} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      {tab === "theme" && (
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
      )}

      {tab === "face" && (
        <div className="face-grid">
          {FACES.map((f) => (
            <button
              key={f}
              className={`face-tile${f === face ? " chosen" : ""}`}
              onClick={() => {
                setFace(f);
                setSaid(undefined);
                wake();
              }}
            >
              <img src={characterImage("chibi", f, theme)} alt="" loading="lazy" />
              <span>{FACE_NAMES[f]}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "bg" && (
        <div className="bg-grid">
          <button className={`bg-tile auto${bg === "auto" ? " chosen" : ""}`} aria-pressed={bg === "auto"} onClick={() => chooseBg("auto")}>
            <img src={`${BG_BASE}${bgFor(theme, "auto")}.webp`} alt="" loading="lazy" />
            <span>衣装に合わせる</span>
          </button>
          {BACKGROUNDS.map((b) => (
            <button key={b.id} className={`bg-tile${bg === b.id ? " chosen" : ""}`} aria-pressed={bg === b.id} onClick={() => chooseBg(b.id)}>
              <img src={`${BG_BASE}${b.id}.webp`} alt="" loading="lazy" />
              <span>{b.name}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "lines" && (
        <>
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
        </>
      )}

      {tab === "album" && (
        <div className="album-grid">
          {revealed.map((t) => (
            <button key={t.id} className="album-tile" onClick={() => navigate({ name: "reveal", theme: t.id })}>
              <img src={`${CHAR_BASE}${t.id}/reveal.webp`} alt="" loading="lazy" />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "profile" && (
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
      )}
    </section>
  );
}
