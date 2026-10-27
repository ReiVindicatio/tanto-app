// 律（T063）の部品：ちびキャラ＋吹き出し（ナビゲーター）、画面の下の欄の縁からのぞく律、吹き出し単体
import { useEffect, useState, type ReactNode } from "react";
import { characterImage, type Expression } from "./character";

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

/** 画面の下に固定した欄（○×の欄・タブ）の縁からのぞく律と、左の吹き出し。置き場所は className で決める。
 *  fadeAfter（ミリ秒）を渡すと、吹き出しはその時間で消え（下のボタンにかぶらないように）、律を押すとまた出る */
export function RitsuDock({ face, children, className = "", fadeAfter }: { face: Expression; children: ReactNode; className?: string; fadeAfter?: number }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (!fadeAfter || !shown) return;
    const t = setTimeout(() => setShown(false), fadeAfter);
    return () => clearTimeout(t);
  }, [fadeAfter, shown]);
  const img = <img className="dock-peek" src={characterImage("peek", face)} alt="" data-face={face} />;
  return (
    <div className={`ritsu-dock ${className}`}>
      <Bubble tail="right" className={`dock-bubble${shown ? "" : " faded"}`}>
        {children}
      </Bubble>
      {fadeAfter ? (
        <button className="dock-peek-button" aria-label="律のひとことをもう一度出す" onClick={() => setShown(true)}>
          {img}
        </button>
      ) : (
        img
      )}
    </div>
  );
}
