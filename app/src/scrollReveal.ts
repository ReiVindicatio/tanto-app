// 答え合わせ・解説が出たら、見える位置まで送る（T066）。肢や問の文が長いと、○×を押しても画面が変わっていないように見えたため
/** これだけ見えていれば送らない（px） */
const ENOUGH = 180;

/**
 * el の上端から ENOUGH 分が、下の固定の欄（○×の欄と、そこに座る律）より上に見えていなければ、el を画面の上へ送る。
 * 止まる位置は CSS の scroll-margin-top（上の帯や、結果の欄に腰かける律の分）。送ったら true
 */
export function revealBelow(el: Element | null): boolean {
  if (!el) return false;
  const bar = document.querySelector(".actionbar");
  const bottom = (bar ? bar.getBoundingClientRect().top : window.innerHeight) - (bar?.querySelector(".ritsu-dock") ? 90 : 0);
  if (el.getBoundingClientRect().top + ENOUGH <= bottom) return false;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  return true;
}
