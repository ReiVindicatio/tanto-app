// 律（T063）の部品：ちびキャラ＋吹き出し（ナビゲーター）、画面の下の欄の縁からのぞく律、吹き出し単体
import { useEffect, useState, type ReactNode } from "react";
import { CHAR_BASE, characterImage, type Expression } from "./character";
import { currentTheme, motionOf } from "./ritsu/themes";
import { linesOf, pickLine, playLine, type Line } from "./ritsu/lines";
import { progressNow } from "./progress";

/** 吹き出し。tail は吹き出しのしっぽの向き（律がいる側） */
export function Bubble({ children, tail = "left", className = "" }: { children: ReactNode; tail?: "left" | "right" | "down"; className?: string }) {
  return (
    <div className={`ritsu-bubble tail-${tail} ${className}`} role="status" aria-live="polite">
      {children}
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
export function PerchFigure({
  face,
  pose = "sit",
  swing = false,
  hop = false,
  className = "",
}: {
  face: Expression;
  pose?: "sit" | "lie";
  swing?: boolean;
  hop?: boolean;
  className?: string;
}) {
  const theme = currentTheme();
  const m = motionOf(theme);
  // 腰かける絵に「びっくり」はない（8表情）。ふつうで代わりに出す
  const f: Expression = face === "surprised" ? "normal" : face;
  const src = pose === "lie" ? characterImage("lie", "sleepy", theme) : characterImage("sit", f, theme);
  const frame = (name: string, cls: string) => <img className={`perch-frame ${cls}`} src={`${CHAR_BASE}${theme}/${name}.webp`} alt="" aria-hidden="true" />;
  return (
    <div
      key={hop ? `hop-${face}` : "still"}
      className={`perch ${pose}${swing ? " swing" : ""}${hop ? " hop" : ""}${(pose === "lie" && m.kick) || (pose === "sit" && m.swing.includes(f)) ? " has-kick" : ""} ${className}`}
      data-face={face}
    >
      <img className="perch-body" src={src} alt="" />
      {pose === "sit" && m.blink.includes(f) && frame(`sit-${f}-blink`, "blink")}
      {pose === "sit" && hop && m.hop.includes(f) && frame(`hop-${f}`, "apex")}
      {pose === "sit" && swing && m.swing.includes(f) && (
        <>
          {frame(`sit-${f}-swing-1`, "k1")}
          {frame(`sit-${f}-swing-2`, "k2")}
        </>
      )}
      {pose === "lie" && m.kick && (
        <>
          {frame("lie-kick-1", "k1")}
          {frame("lie-kick-2", "k2")}
        </>
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
}: {
  face: Expression;
  pose?: "sit" | "lie";
  hop?: boolean;
  swing?: boolean;
  children?: ReactNode;
  className?: string;
  fadeAfter?: number;
  onPeek?: () => void;
  /** 吹き出しを最初は出さない（押したら出す） */
  startHidden?: boolean;
}) {
  const [shown, setShown] = useState(!startHidden);
  const [tapped, setTapped] = useState(0); // 押したら、その場で跳ねて応える
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
    if (!motionOf(currentTheme()).mid) {
      setShownPose(pose);
      return;
    }
    setBetween(true);
    const t = setTimeout(() => {
      setBetween(false);
      setShownPose(pose);
    }, 260);
    return () => clearTimeout(t);
  }, [pose, shownPose]);
  const img = between ? (
    <div className="perch mid dock-ritsu" data-face={face}>
      <img className="perch-body" src={`${CHAR_BASE}${currentTheme()}/mid-lie.webp`} alt="" />
    </div>
  ) : (
    <PerchFigure key={tapped} face={face} pose={shownPose} hop={hop || (tapped > 0 && shownPose === "sit")} swing={swing} className="dock-ritsu" />
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
  const idle = useIdle(30000);
  const [line, setLine] = useState<Line | undefined>(undefined);
  const theme = currentTheme();
  return (
    <RitsuDock
      face={idle ? "sleepy" : (line?.face ?? "smile")}
      pose={idle ? "lie" : "sit"}
      swing
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
