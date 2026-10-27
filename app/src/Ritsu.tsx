// 律（T063）の部品：ちびキャラ＋吹き出し（ナビゲーター）、画面の下の欄の縁からのぞく律、吹き出し単体
import { useEffect, useState, type ReactNode } from "react";
import { CHAR_BASE, characterImage, type Expression } from "./character";
import { currentTheme, motionOf } from "./ritsu/themes";
import { linesOf, pickLine, playLine, useSpeaking, type Line } from "./ritsu/lines";
import { progressNow } from "./progress";

/** 律の言葉を1文字ずつ出す（ノベルゲームのように）。まだ出ていない文字は透明で置いておく（吹き出しの大きさが途中で変わらない。文字としては最初から全文） */
export function TypeText({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    const t = window.setInterval(() => setN((k) => (k >= text.length ? (window.clearInterval(t), k) : k + 1)), 38);
    return () => window.clearInterval(t);
  }, [text]);
  return (
    <>
      {text.slice(0, n)}
      <span className="type-rest">{text.slice(n)}</span>
    </>
  );
}

/** 吹き出し。tail は吹き出しのしっぽの向き（律がいる側）。中身が文字だけなら1文字ずつ出す */
export function Bubble({ children, tail = "left", className = "" }: { children: ReactNode; tail?: "left" | "right" | "down"; className?: string }) {
  return (
    <div className={`ritsu-bubble tail-${tail} ${className}`} role="status" aria-live="polite">
      {typeof children === "string" ? <TypeText text={children} /> : children}
    </div>
  );
}

/** ちびキャラが吹き出しで話す（ホーム・結果・初めての案内・空いている画面） */
export function RitsuSays({ face, children, className = "" }: { face: Expression; children: ReactNode; className?: string }) {
  return (
    <div className={`ritsu-says ${className}`}>
      <img className="ritsu-chibi" src={characterImage("chibi", face)} alt="" data-face={face} />
      <Bubble>{children}</Bubble>
    </div>
  );
}

/**
 * 縁に腰かける・寝そべる律の絵（T065）。細かい動きは、同じ絵を重ねて切り分けて動かす（描き直すとちらつくため）：
 * 足のバタバタ（腰かける・寝そべる）とまばたきは、足や目だけを描き直したコマを重ねて切り替える（テーマの motion にあるものだけ）。
 * 足を縦に縮めて見せるやり方は「伸び縮み」に見えたのでやめた（2026-10-27 ユーザー）
 */
/** 感情の記号（頭の右上にぽんと出す）。考え中＝？・喜び＝！・得意げ＝♪・残念＝汗・ジト目＝…・眠い・寝そべり＝zzz */
const EMOTE: Partial<Record<Expression, string>> = { think: "？", happy: "！", smug: "♪", sad: "💧", jito: "…", sleepy: "z" };

export function PerchFigure({
  face,
  pose = "sit",
  swing = false,
  hop = false,
  talk = false,
  gesture = null,
  emote = false,
  className = "",
}: {
  face: Expression;
  pose?: "sit" | "lie";
  swing?: boolean;
  hop?: boolean;
  /** 口パク（声が流れている間） */
  talk?: boolean;
  /** 仕草（あくび・伸び・ココア・衣装の動作・こっくり・拍手・むくれ）。出している間は元の絵の代わりにその絵 */
  gesture?: string | null;
  /** 感情の記号を出す */
  emote?: boolean;
  className?: string;
}) {
  const theme = currentTheme();
  const m = motionOf(theme);
  // 腰かける絵に「びっくり」はない（8表情）。ふつうで代わりに出す
  const f: Expression = face === "surprised" ? "normal" : face;
  const src = pose === "lie" ? characterImage("lie", "sleepy", theme) : characterImage("sit", f, theme);
  const frame = (name: string, cls: string) => <img className={`perch-frame ${cls}`} src={`${CHAR_BASE}${theme}/${name}.webp`} alt="" aria-hidden="true" />;
  const g = pose === "sit" && gesture && m.gestures.includes(gesture) ? gesture : null;
  const talking = pose === "sit" && talk && !g && m.talk.includes(f);
  const mark = !emote ? undefined : pose === "lie" ? "z" : g ? undefined : EMOTE[f];
  return (
    <div
      key={hop ? `hop-${face}` : "still"}
      className={`perch ${pose}${swing && !g && !talking ? " swing" : ""}${hop ? " hop" : ""}${g ? " gesturing" : ""}${talking ? " talking" : ""}${(pose === "lie" && m.kick) || (pose === "sit" && m.swing.includes(f)) ? " has-kick" : ""} ${className}`}
      data-face={face}
      data-gesture={g ?? undefined}
    >
      {/* 息をする（ごくわずかに上下）。跳ねる動きは外側、息は内側にかける */}
      <div className="perch-inner">
        <img className="perch-body" src={src} alt="" />
        {pose === "sit" && m.blink.includes(f) && frame(`sit-${f}-blink`, "blink")}
        {pose === "sit" && hop && m.hop.includes(f) && frame(`hop-${f}`, "apex")}
        {pose === "sit" && swing && !g && !talking && m.swing.includes(f) && (
          <>
            {frame(`sit-${f}-swing-1`, "k1")}
            {frame(`sit-${f}-swing-2`, "k2")}
          </>
        )}
        {talking && frame(`sit-${f}-talk`, "talk")}
        {g && frame(`gesture-${g}`, "gesture")}
        {pose === "lie" && m.kick && (
          <>
            {frame("lie-kick-1", "k1")}
            {frame("lie-kick-2", "k2")}
          </>
        )}
      </div>
      {mark && (
        <span key={`${f}-${pose}`} className={`perch-emote${mark === "z" ? " zzz" : ""}`} aria-hidden="true">
          {mark === "z" ? (
            <>
              <i>z</i>
              <i>z</i>
              <i>z</i>
            </>
          ) : (
            mark
          )}
        </span>
      )}
    </div>
  );
}

/** 画面の下に固定した欄（○×の欄・タブ）の縁に腰かける律と、左の吹き出し。置き場所は className で決める。
 *  pose：sit＝腰かける（足は欄にぶら下がる）、lie＝寝そべって本を読む。hop：正解などで、その場でぴょんと跳ねる
 *  fadeAfter（ミリ秒）を渡すと、吹き出しはその時間で消え（下のボタンにかぶらないように）、律を押すとまた出る（onPeek も呼ぶ） */
export function RitsuDock({
  face,
  children,
  className = "",
  fadeAfter,
  onPeek,
  pose = "sit",
  hop = false,
  swing = false,
  startHidden = false,
  talk = false,
  lively = false,
  act = null,
}: {
  /** 決まった仕草をさせる（拍手・むくれなど。待っている間の仕草より優先） */
  act?: string | null;
  face: Expression;
  pose?: "sit" | "lie";
  hop?: boolean;
  swing?: boolean;
  /** 口パク（聞き流しの読み上げなど。律のセリフの声が流れている間は、言わなくても口パクする） */
  talk?: boolean;
  /** 待っている間に、ときどき仕草をする（あくび・伸び・目をこする・ココア・衣装の動作） */
  lively?: boolean;
  children?: ReactNode;
  className?: string;
  fadeAfter?: number;
  onPeek?: () => void;
  /** 吹き出しを最初は出さない（押したら出す） */
  startHidden?: boolean;
}) {
  const [shown, setShown] = useState(!startHidden);
  const [tapped, setTapped] = useState(0); // 押したら、その場で跳ねて応える
  const speaking = useSpeaking();
  const motion = motionOf(currentTheme());
  const [gesture, setGesture] = useState<string | null>(null);
  // 待っている間の仕草：最初は4〜8秒、そのあと7〜14秒ごとに2秒ほど。衣装の動作は多めに（4割）。
  // 寝そべる（しばらく操作がない）までに何度か見られるように（30秒で寝そべっていて、ほとんど見られなかった：ユーザー）
  useEffect(() => {
    if (!lively || pose !== "sit") return;
    const idleGestures = motion.gestures.filter((g) => ["yawn", "stretch", "rub", "sip", "signature"].includes(g));
    if (!idleGestures.length) return;
    let t: number;
    let end: number;
    const others = idleGestures.filter((g) => g !== "signature");
    const pick = () =>
      idleGestures.includes("signature") && (Math.random() < 0.4 || !others.length)
        ? "signature"
        : others[Math.floor(Math.random() * others.length)];
    const schedule = (first: boolean) => {
      t = window.setTimeout(
        () => {
          setGesture(pick());
          end = window.setTimeout(() => {
            setGesture(null);
            schedule(false);
          }, 2200);
        },
        first ? 4000 + Math.random() * 4000 : 7000 + Math.random() * 7000,
      );
    };
    schedule(true);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(end);
      setGesture(null);
    };
  }, [lively, pose, motion]);
  useEffect(() => {
    if (!fadeAfter || !shown) return;
    const t = setTimeout(() => setShown(false), fadeAfter);
    return () => clearTimeout(t);
  }, [fadeAfter, shown]);
  // 座る⇄寝そべるの切り替えでは、間の絵（寝転びかけ）を短くはさむ（テーマに間の絵があるときだけ）
  const [shownPose, setShownPose] = useState(pose);
  const [between, setBetween] = useState(false);
  useEffect(() => {
    if (pose === shownPose) return;
    const m = motionOf(currentTheme());
    // 座る→寝そべる：こっくり（首がかくっと落ちる）をしてから、間の絵をはさんで寝そべる
    const nod = pose === "lie" && m.gestures.includes("nod") ? 1500 : 0;
    if (nod) setGesture("nod");
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        setGesture(null);
        if (!m.mid) {
          setShownPose(pose);
          return;
        }
        setBetween(true);
        timers.push(
          window.setTimeout(() => {
            setBetween(false);
            setShownPose(pose);
          }, 260),
        );
      }, nod),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [pose, shownPose]);
  const img = between ? (
    <div className="perch mid dock-ritsu" data-face={face}>
      <img className="perch-body" src={`${CHAR_BASE}${currentTheme()}/mid-lie.webp`} alt="" />
    </div>
  ) : (
    <PerchFigure
      key={tapped}
      face={face}
      pose={shownPose}
      hop={hop || (tapped > 0 && shownPose === "sit")}
      swing={swing}
      talk={talk || speaking}
      gesture={act ?? gesture}
      emote
      className="dock-ritsu"
    />
  );
  return (
    <div className={`ritsu-dock ${className}`}>
      {children ? (
        <Bubble tail="right" className={`dock-bubble${shown ? "" : " faded"}`}>
          {children}
        </Bubble>
      ) : null}
      {fadeAfter ? (
        <button
          className="dock-peek-button"
          aria-label="律に話しかける"
          onClick={() => {
            setShown(true);
            setTapped((n) => n + 1);
            setGesture(null);
            onPeek?.();
          }}
        >
          {img}
        </button>
      ) : (
        img
      )}
    </div>
  );
}

/** しばらく何も操作しなければ true（押す・キーを打つ・スクロールで false に戻る）。律が眠くなる・寝そべるのに使う */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), ms);
    const reset = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    const evs = ["pointerdown", "keydown", "scroll"] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);
  return idle;
}

/**
 * 科目・マイページのタブの律（T065）：タブの縁に座っているだけ。吹き出しは自分からは出さず、押すとひとこと（声つき）。
 * しばらく操作しないと寝そべって本を読む
 */
export function TabRitsu() {
  const level = progressNow().level;
  const idle = useIdle(75000);
  const [line, setLine] = useState<Line | undefined>(undefined);
  const theme = currentTheme();
  return (
    <RitsuDock
      face={idle ? "sleepy" : (line?.face ?? "smile")}
      pose={idle ? "lie" : "sit"}
      swing
      lively
      className="home-dock tab-dock"
      fadeAfter={5000}
      startHidden
      onPeek={() => {
        const wear = linesOf(`wear_${theme}`, level);
        const l = wear.length && Math.random() < 0.3 ? wear[Math.floor(Math.random() * wear.length)] : pickLine("tap", level);
        if (l) {
          setLine(l);
          playLine(l);
        }
      }}
    >
      {line?.text ?? " "}
    </RitsuDock>
  );
}
