// 律（T063）の部品：ちびキャラ＋吹き出し（ナビゲーター）と、吹き出し単体
import type { ReactNode } from "react";
import { characterImage, type Expression } from "./character";

/** 吹き出し。tail は吹き出しのしっぽの向き（律がいる側） */
export function Bubble({ children, tail = "left", className = "" }: { children: ReactNode; tail?: "left" | "down"; className?: string }) {
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
