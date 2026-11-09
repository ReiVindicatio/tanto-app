// 下の欄のボタン（○×⇄次へ、採点する⇄次へ）は同じ場所で入れ替わるので、スマホで二度押しすると、入れ替わった先のボタンまで押していた
// （○の二度押しで答え合わせを見ずに次へ、次へ の二度押しで次の肢に×と答えて記録）。入れ替わった直後の少しの間だけ押せなくする
import { useLayoutEffect, useRef, useState } from "react";

/** 入れ替わってから押せるようになるまで（ミリ秒）。ふつうの二度押しの間隔より少し長く */
export const SWAP_GUARD_MS = 350;

/**
 * key が変わった直後の SWAP_GUARD_MS の間 true を返す（はじめの表示では false）。
 * true の間は欄に settling を付け、CSS でボタンを押せなくする（キーボード・スワイプはそのまま）
 */
export function useSwapGuard(key: unknown, ms = SWAP_GUARD_MS): boolean {
  const [settling, setSettling] = useState(false);
  const first = useRef(true);
  // 押した操作の描画の中で付ける（次の押下より前に効かせるため、useEffect ではなく useLayoutEffect）
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSettling(true);
    const t = window.setTimeout(() => setSettling(false), ms);
    return () => window.clearTimeout(t);
  }, [key, ms]);
  return settling;
}
