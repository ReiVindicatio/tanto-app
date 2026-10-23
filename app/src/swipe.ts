import { useEffect, useRef, useState } from "react";

/** 肢カードを左右にはじく操作（T051）。右＝○・左＝×、答え合わせの後はどちらでも次へ */
export type SwipeDir = "left" | "right";

/** 画面の端から始めた操作は、ブラウザの「戻る」（iPhone の左端からのスワイプ）に任せる */
const EDGE = 24;
/** これだけ動くまでは、横か縦かを決めない */
const SLOP = 8;
/** 横の動きが縦の何倍以上なら「横」とみなすか（少し斜めでも横に寄せる） */
const HORIZONTAL_BIAS = 0.8;
/** はじいたカードが飛んでいく時間（ms） */
export const FLY_MS = 220;

/** はじいたとみなす横の距離（画面の幅の4分の1。狭い画面でも 80px 以上） */
export function swipeThreshold(width: number): number {
  return Math.max(80, width * 0.25);
}

/** 横か縦かを決める（決まらなければ null） */
export function lockAxis(mx: number, my: number): "x" | "y" | null {
  if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return null;
  return Math.abs(mx) >= Math.abs(my) * HORIZONTAL_BIAS ? "x" : "y";
}

/** 指を離したときに、はじいたとみなすか。遠くまで動かしたか、短くても素早く払ったら確定 */
export function swipeDecision(dx: number, dy: number, ms: number, width: number): SwipeDir | null {
  const ax = Math.abs(dx);
  if (ax < Math.abs(dy)) return null;
  const far = ax >= swipeThreshold(width);
  const fast = ax >= 40 && ax / Math.max(ms, 1) >= 0.6;
  if (!far && !fast) return null;
  return dx > 0 ? "right" : "left";
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * カードを飛ばす：いまのカードの複製を同じ位置に重ねて画面の外へ飛ばし、終わったら消す。
 * 元の場所はすぐ次のカード（答え合わせ・次の肢）に替わるので、飛んでいくカードの後ろから次のカードが見える。
 * 複製は React の外（body の直下）に置く
 */
export function flyAway(el: HTMLElement, dir: SwipeDir, dx: number, stamp?: { text: string; className: string }) {
  if (prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("style");
  ghost.classList.remove("dragging");
  ghost.classList.add("swipe-ghost", dir);
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px` });
  ghost.style.setProperty("--dx", `${dx}px`);
  ghost.style.setProperty("--rot", `${dx / 30}deg`);
  if (stamp) {
    let st = ghost.querySelector<HTMLElement>(".swipe-stamp");
    if (!st) {
      st = document.createElement("div");
      ghost.prepend(st);
    }
    st.className = `swipe-stamp ${stamp.className}`;
    st.textContent = stamp.text;
    st.style.opacity = "1";
  }
  document.body.appendChild(ghost);
  const remove = () => ghost.remove();
  ghost.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, FLY_MS + 200); // animationend が来なかったときの保険
}

type Start = { x: number; y: number; t: number; axis: "x" | "y" | null };

/**
 * カードの要素に付ける ref（コールバック。カードが作り直されたら付け直す）と、いまの横のずれ（dx）を返す。
 * タッチのイベントで受け取り、横に動かし始めたら縦のスクロールを止める（touchmove の preventDefault。
 * React の onTouchMove は passive で止められないので、要素に直接 { passive: false } で付ける）。
 * マウスは対象にしない（PC はキーボードで答える。文の選択と紛れるため）
 */
export function useSwipe<T extends HTMLElement>(onSwipe: (dir: SwipeDir, dx: number) => void, enabled: boolean) {
  const [el, ref] = useState<T | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  // リスナーは要素ごとに一度だけ付け、最新の値は ref から読む
  const latest = useRef({ onSwipe, enabled });
  latest.current = { onSwipe, enabled };

  useEffect(() => {
    if (!el) return;
    let start: Start | null = null;

    function reset() {
      start = null;
      setDragging(false);
      setDx(0);
    }
    function onStart(e: TouchEvent) {
      if (!latest.current.enabled || e.touches.length !== 1) return;
      const p = e.touches[0];
      if (p.clientX < EDGE || p.clientX > window.innerWidth - EDGE) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      start = { x: p.clientX, y: p.clientY, t: e.timeStamp, axis: null };
    }
    function onMove(e: TouchEvent) {
      if (!start) return;
      if (e.touches.length !== 1) return reset();
      const p = e.touches[0];
      const mx = p.clientX - start.x;
      const my = p.clientY - start.y;
      if (start.axis === null) {
        start.axis = lockAxis(mx, my);
        if (start.axis === null) return;
        if (start.axis === "y") {
          start = null; // 縦のスクロールはブラウザに任せる
          return;
        }
        setDragging(true);
      }
      if (e.cancelable) e.preventDefault(); // 横に動かしている間は縦にスクロールさせない
      setDx(mx);
    }
    function onEnd(e: TouchEvent) {
      if (!start) return;
      const s = start;
      const p = e.changedTouches[0];
      const dx = p ? p.clientX - s.x : 0;
      const dir = s.axis === "x" && p ? swipeDecision(dx, p.clientY - s.y, e.timeStamp - s.t, window.innerWidth) : null;
      reset();
      if (dir && latest.current.enabled) latest.current.onSwipe(dir, dx);
    }
    function onCancel() {
      if (start) reset();
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [el]);

  return { ref, el, dx, dragging };
}
