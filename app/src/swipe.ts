import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** 肢カードを左右にはじく操作（T051）。右＝○・左＝×、答え合わせの後はどちらでも次へ */
export type SwipeDir = "left" | "right";

/** 画面の端から始めた操作は、ブラウザの「戻る」（iPhone の左端からのスワイプ）に任せる */
const EDGE = 24;
/** これだけ動くまでは、横か縦かを決めない */
const SLOP = 10;

/** はじいたとみなす横の距離（画面の幅の4分の1。狭い画面でも 80px 以上） */
export function swipeThreshold(width: number): number {
  return Math.max(80, width * 0.25);
}

/** 指を離したときに、はじいたとみなすか。遠くまで動かしたか、短くても素早く払ったら確定 */
export function swipeDecision(dx: number, dy: number, ms: number, width: number): SwipeDir | null {
  const ax = Math.abs(dx);
  if (ax < Math.abs(dy) * 1.5) return null;
  const far = ax >= swipeThreshold(width);
  const fast = ax >= 40 && ax / Math.max(ms, 1) >= 0.6;
  if (!far && !fast) return null;
  return dx > 0 ? "right" : "left";
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Start = { id: number; x: number; y: number; t: number; horizontal: boolean | null };

/**
 * カードに付ける pointer のハンドラと、いまの横のずれ（dx）を返す。
 * 縦のスクロールはブラウザに任せる（CSS の touch-action: pan-y。縦に動かすとブラウザが pointercancel を送る）。
 * マウスは対象にしない（PC はキーボードで答える。文の選択と紛れるため）
 */
export function useSwipe(onSwipe: (dir: SwipeDir) => void, enabled: boolean) {
  const start = useRef<Start | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  function reset() {
    start.current = null;
    setDragging(false);
    setDx(0);
  }

  const handlers = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (!enabled || e.pointerType === "mouse" || !e.isPrimary) return;
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, horizontal: null };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (s.horizontal === null) {
        if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
        s.horizontal = Math.abs(mx) > Math.abs(my);
        if (!s.horizontal) {
          start.current = null;
          return;
        }
        setDragging(true);
      }
      setDx(mx);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const dir = s.horizontal ? swipeDecision(e.clientX - s.x, e.clientY - s.y, e.timeStamp - s.t, window.innerWidth) : null;
      reset();
      if (dir) onSwipe(dir);
    },
    onPointerCancel() {
      if (start.current) reset();
    },
  };

  return { dx, dragging, handlers };
}
