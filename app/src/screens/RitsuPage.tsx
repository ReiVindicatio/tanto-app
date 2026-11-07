// 律のページ（T065）：上に背景つきの立ち絵（押すとひとこと・スクロールしても上に残る）、下はタブ（衣装・表情・背景・セリフ・アルバム・プロフィール）。
// 律の言葉は ritsu/lines.json の決まった言葉だけ。声は押したときだけ鳴らす
import { useEffect, useRef, useState } from "react";
import { back, navigate } from "../router";
import { progressNow } from "../progress";
import { bgUrl, charDir, characterImage, FACES, type Expression } from "../character";
import { Bubble } from "../Ritsu";
import { currentTheme, isRevealed, isSpecial, isUnlocked, motionOf, nextTheme, setTheme, themeById, THEMES, unlockLabel } from "../ritsu/themes";
import { ALL_LINES, lineText, linesOf, pickLine, playLine, useSpeaking, type Line } from "../ritsu/lines";
import { useAdmin } from "../admin";
import { playMove, smallMove, StarFall, TowerWind } from "../ritsu/special";
import { fxOn, useFx } from "../ritsu/fx";
import { moonKind, moonPath } from "../ritsu/moon";
import { evoStage } from "../ritsu/themes";
import { kitOf } from "../ritsu/kits";
import { GrowTab, IdeasTab, StoryTab } from "./RitsuSpecial";
import { TrialButton, WantButton } from "../ritsu/TrialLayer";
import { TRIAL_THEME, useTrial } from "../ritsu/trial";
import { useMouthOpen } from "../ritsu/lipsync";
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
  pat_head: "頭をなでたとき",
  poke_cheek: "ほっぺをつついたとき",
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
  if (scene.startsWith("levelup_")) return "レベルアップ（特別な衣装）";
  if (scene.startsWith("goal_")) return "今日の目標（特別な衣装）";
  if (scene.startsWith("wear_")) return `${themeById(scene.slice(5))?.name ?? "衣装"}のとき`;
  return SCENE_NAMES[scene] ?? scene;
}

const SKY_SEEN = "tanto.special.sky.seen.v1";
type Tab = "theme" | "face" | "lines" | "album" | "profile" | "sky" | "story" | "ideas";
const TABS: { id: Tab; name: string }[] = [
  { id: "theme", name: "衣装" },
  { id: "face", name: "表情" },
  { id: "lines", name: "セリフ" },
  { id: "album", name: "アルバム" },
  { id: "profile", name: "プロフィール" },
];

/** しばらく触らないと眠そうになる（ミリ秒） */
const DOZE_AFTER = 25000;

export default function RitsuPage() {
  const p = progressNow();
  const admin = useAdmin();
  useFx();
  const [theme, setThemeState] = useState(() => currentTheme(p.level));
  // お試し（T070）が始まった・終わったら、着ている服を取り直す
  const trialStatus = useTrial().status;
  useEffect(() => setThemeState(currentTheme(p.level)), [trialStatus]);
  const [face, setFace] = useState<Expression>("smile");
  const [said, setSaid] = useState<Line | undefined>(() => pickLine("tap", 1));
  const [tab, setTab] = useState<Tab>("theme");
  const [skySeen, setSkySeen] = useState(() => {
    try {
      return localStorage.getItem(SKY_SEEN) === "1";
    } catch {
      return true;
    }
  });
  function openTab(id: Tab) {
    setTab(id);
    if (id !== "sky") return;
    setSkySeen(true);
    try {
      localStorage.setItem(SKY_SEEN, "1");
    } catch {
      // 覚えられなくても動く
    }
  }
  const [videoOk, setVideoOk] = useState(true);
  const [bump, setBump] = useState(0); // 押したときの小さな跳ね（描き直しのきっかけ）
  const next = nextTheme(p.level);
  const doze = useRef<number | undefined>(undefined);
  const speaking = useSpeaking();
  const m = motionOf(theme);
  
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

  /** 押したときのひとこと：押した場所で変える（頭＝照れる・ほっぺ＝むくれる・ほか＝おしゃべり。衣装のときだけのセリフも混ぜる） */
  function touch(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (e.clientY && y < 0.2) return say(pickLine("pat_head", p.level));
    if (e.clientY && y < 0.34) return say(pickLine("poke_cheek", p.level));
    talk();
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


  const wearing = isSpecial(theme);
  const special = THEMES.find((t) => isSpecial(t.id) && isUnlocked(t, p.level));
  const kit = kitOf(theme);
  const useRealMoon = wearing && kit.realMoon && fxOn("realmoon");
  const showVideo = wearing && !kit.noStageVideo && fxOn("stagevideo") && videoOk && !speaking && face === "smile";
  // 立ち絵のにっこりは、色違いと進化の段階で変わる
  const sprite = !wearing || face !== "smile" ? characterImage("base", face, theme)
    : kit.dawn && fxOn("dawn") ? `${charDir(theme)}base-smile-dawn.webp`
    : fxOn("evolve") && evoStage() > 0 ? `${charDir(theme)}base-smile-evo${evoStage() + 1}.webp`
    : characterImage("base", face, theme);
  // 口パクの絵はふつうの立ち絵に合わせてある。色違い・進化の絵に重ねると、色と位置の違う2枚が入れ替わって見える（ユーザー）
  const canTalk = m.talkBase.includes(face) && sprite === characterImage("base", face, theme);
  const mouthOpen = useMouthOpen(speaking && canTalk);
  // 特別な衣装（T069）の絵は、開いている人にだけ渡す。開いていなければ鍵の印と名前だけ
  const shownThemes = THEMES.filter((t) => !isSpecial(t.id) || isUnlocked(t, p.level));
  const specialThemes = THEMES.filter((t) => isSpecial(t.id));
  const lineBook = ALL_LINES.filter((l) => !l.special || admin);
  const open = lineBook.filter((l) => l.level <= p.level);
  const scenes = [...new Set(open.map((l) => sceneName(l.scene)))];
  const locked = lineBook.length - open.length;
  const revealed = shownThemes.filter((t) => t.id !== "default" && isRevealed(t.id));

  return (
    <section className={`ritsu-page${tab === "sky" ? " grow-open" : ""}`}>
      <div className="toolbar">
        <button className="link" onClick={() => back({ name: "me" })}>
          ← 戻る
        </button>
        <span />
        <span />
      </div>

      {/* 立ち絵：背景つきで上に残す（スクロールしても、選んだ衣装・表情・背景がすぐ見える） */}
      {wearing && fxOn("wind") && <TowerWind />}
      <div className="ritsu-stage" style={{ backgroundImage: `url(${useRealMoon ? `${charDir(theme)}bg-nomoon.webp` : bgUrl(theme)})` }}>
        {wearing && <StarFall />}
        {useRealMoon && (
          <button className="real-moon" aria-label="今夜の月" onClick={() => say(ALL_LINES.filter((l) => l.scene === `moon_${theme}`)[moonKind(new Date())])}>
            <svg viewBox="-24 -24 48 48" aria-hidden="true">
              <circle r="20" fill="#39426e" opacity="0.5" />
              <path d={moonPath(new Date(), 20)} fill="#fff4c9" />
            </svg>
          </button>
        )}
        {showVideo && <video className="stage-video" src={`${charDir(theme)}idle-stage.mp4`} autoPlay loop muted playsInline onError={() => setVideoOk(false)} />}
        {said && (
          <Bubble tail="right" className="vn-bubble stage-bubble">
            {lineText(said, { n: "いくつか" })}
          </Bubble>
        )}
        <button className="ritsu-sprite-button" aria-label="律に話しかける" onClick={touch}>
          <span key={bump} className={`sprite-wrap${bump ? " bump" : ""}${face === "sleepy" ? " dozing" : ""}${speaking && canTalk ? " talking" : ""}${mouthOpen ? " mouth-open" : ""}`}>
            <img className={`vn-sprite${showVideo ? " under-video" : ""}`} src={sprite} alt="" data-face={face} />
            {/* 口パク：律の声が流れている間 */}
            {speaking && canTalk && (
              <img className="sprite-talk" src={`${charDir(theme)}base-${face}-talk.webp`} alt="" aria-hidden="true" />
            )}
          </span>
        </button>
      </div>
      {wearing && fxOn("evolve") && <div className="evo-name">{kit.evo[evoStage()]}</div>}
      {admin && isSpecial(theme) && (
        <div className="row special-preview">
          <span className="muted small">管理者：演出を確かめる</span>
          <button className="secondary" onClick={() => playMove(theme, "entrance")}>登場</button>
          <button className="secondary" onClick={() => playMove(theme, "finish", { line: pickLine(`levelup_${theme}`, Infinity) })}>決め</button>
          <button className="secondary" onClick={() => smallMove(theme)}>小さな決め</button>
        </div>
      )}
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
        {[...TABS, ...(wearing && (kit.grow === "sky" || kit.grow === "stickers") && fxOn("sky") ? [{ id: "sky" as Tab, name: kit.growName }] : []), ...(wearing && fxOn("story") ? [{ id: "story" as Tab, name: "物語" }] : []), ...(admin && special ? [{ id: "ideas" as Tab, name: "案" }] : [])].filter((t) => t.id !== "album" || revealed.length > 0).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "chosen" : ""} onClick={() => openTab(t.id)}>
            {t.name}
            {t.id === "sky" && !skySeen && <span className="tab-new" aria-label="新しい" />}
          </button>
        ))}
      </div>

      {tab === "sky" && <GrowTab theme={theme} />}
      {tab === "story" && <StoryTab theme={theme} admin={admin} />}
      {tab === "ideas" && <IdeasTab theme={wearing ? theme : (special?.id ?? theme)} />}
      {tab === "theme" && <h3 className="theme-section">いつもの衣装</h3>}
      {tab === "theme" && (
        <div className="theme-grid">
          {THEMES.filter((t) => !isSpecial(t.id)).map((t) => {
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
                {!ok && <span className="lock-mark" aria-label="未開放">🔒</span>}
                <span>{ok ? t.name : unlockLabel(t)}</span>
                {ok && t.id !== "default" && !isRevealed(t.id) && <span className="theme-new">NEW</span>}
              </button>
            );
          })}
        </div>
      )}
      {tab === "theme" && specialThemes.length > 0 && (
        <>
          <h3 className="theme-section">特別な衣装</h3>
          {/* 着られる衣装（持っている・お試し中）を先に。下に並べると、まだ持っていない衣装のカードに埋もれた（ユーザー。T074） */}
          <div className="theme-grid">
            {specialThemes.filter((t) => isUnlocked(t, p.level)).map((t) => (
              <button key={t.id} className={`theme-tile${t.id === theme ? " chosen" : ""}`} aria-pressed={t.id === theme} onClick={() => wear(t.id)}>
                <img src={characterImage("base", "smile", t.id)} alt="" loading="lazy" />
                <span>{t.name}</span>
                {!isRevealed(t.id) && <span className="theme-new">NEW</span>}
              </button>
            ))}
          </div>
          {specialThemes.some((t) => isUnlocked(t, p.level)) && specialThemes.some((t) => !isUnlocked(t, p.level)) && (
            <p className="muted small special-unowned">まだ持っていない衣装</p>
          )}
          {/* 買う前に見せるのは全身の絵1枚・名前・紹介文だけ（T070）。見本の1着だけ試せる */}
          <div className="special-cards">
            {specialThemes.filter((t) => !isUnlocked(t, p.level)).sort((a, b) => Number(b.id === TRIAL_THEME) - Number(a.id === TRIAL_THEME)).map((t) => (
              <div key={t.id} className={`special-locked kit-${t.id}`}>
                <img src={characterImage("base", "smile", t.id)} alt="" loading="lazy" />
                <div className="special-locked-body">
                  <strong>{t.name}</strong>
                  <p className="muted small">{t.desc}</p>
                  <span className="muted small"><span aria-label="未開放">🔒</span> {unlockLabel(t)}</span>
                  {t.id === TRIAL_THEME && <TrialButton onStart={() => setThemeState(TRIAL_THEME)} />}
                  <WantButton theme={t.id} />
                </div>
              </div>
            ))}
          </div>
          {wearing && kit.grow === "sky" && fxOn("sky") && !skySeen && (
            <p className="sky-note small">
              星詠みを着ているあいだは、解くほど星が増える「{kit.growName}」が見られます。{" "}
              <button className="link" onClick={() => openTab("sky")}>見に行く</button>
            </p>
          )}
        </>
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
              <img src={`${charDir(t.id)}reveal.webp`} alt="" loading="lazy" />
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
