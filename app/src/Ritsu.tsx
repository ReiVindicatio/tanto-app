// 律（T063）の部品：ちびキャラ＋吹き出し（ナビゲーター）、画面の下の欄の縁からのぞく律、吹き出し単体
import { useEffect, useState, type ReactNode } from "react";
import { CHAR_BASE, characterImage, type Expression } from "./character";
import { currentTheme, motionOf } from "./ritsu/themes";

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
 * 腰かける＝座る線より下を左足・右足に分け、交互に伸び縮み（足をバタバタ）。
 * まばたき・寝そべりの足のパタパタは、目や足先だけを描き直したコマを重ねて切り替える（テーマの motion にあるものだけ）
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
  const src = pose === "lie" ? characterImage("lie", "sleepy", theme) : characterImage("sit", face, theme);
  const frame = (name: string, cls: string) => <img className={`perch-frame ${cls}`} src={`${CHAR_BASE}${theme}/${name}.webp`} alt="" aria-hidden="true" />;
  return (
    <div
      key={hop ? `hop-${face}` : "still"}
      className={`perch ${pose}${swing ? " swing" : ""}${hop ? " hop" : ""}${pose === "lie" && m.kick ? " has-kick" : ""} ${className}`}
      data-face={face}
    >
      <img className="perch-body" src={src} alt="" />
      {pose === "sit" && m.blink.includes(face) && frame(`sit-${face}-blink`, "blink")}
      {pose === "sit" && hop && m.hop.includes(face) && frame(`hop-${face}`, "apex")}
      {pose === "sit" ? (
        <>
          <img className="perch-leg left" src={src} alt="" aria-hidden="true" />
          <img className="perch-leg right" src={src} alt="" aria-hidden="true" />
        </>
      ) : (
        m.kick && (
          <>
            {frame("lie-kick-1", "k1")}
            {frame("lie-kick-2", "k2")}
          </>
        )
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
}: {
  face: Expression;
  pose?: "sit" | "lie";
  hop?: boolean;
  swing?: boolean;
  children: ReactNode;
  className?: string;
  fadeAfter?: number;
  onPeek?: () => void;
}) {
  const [shown, setShown] = useState(true);
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
    <PerchFigure face={face} pose={shownPose} hop={hop} swing={swing} className="dock-ritsu" />
  );
  return (
    <div className={`ritsu-dock ${className}`}>
      <Bubble tail="right" className={`dock-bubble${shown ? "" : " faded"}`}>
        {children}
      </Bubble>
      {fadeAfter ? (
        <button
          className="dock-peek-button"
          aria-label="律に話しかける"
          onClick={() => {
            setShown(true);
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
