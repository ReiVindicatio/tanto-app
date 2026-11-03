// 司書の本：体の横に3冊ずつ控え、その場でふわふわする（入れ替わらない：ユーザー）。奥の本は体の後ろ、手前の本は体の前
import { useEffect, useRef } from "react";
import { charDir } from "../character";

/** 置き場所（律の絵の幅 100 に対する位置。x は体の中心から、y は座る線から上へ）と、絵・幅・奥か手前か */
const BOOKS: { x: number; y: number; name: string; width: number; front: boolean }[] = [
  { x: -70, y: 80, name: "book-closed", width: 27, front: false },
  { x: -80, y: 48, name: "book-open", width: 36, front: true },
  { x: -62, y: 22, name: "book-closed2", width: 26, front: false },
  { x: 70, y: 76, name: "book-closed", width: 24, front: true },
  { x: 78, y: 45, name: "book-closed2", width: 30, front: false },
  { x: 61, y: 19, name: "book-open", width: 29, front: true },
];

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BookAttendants({ theme }: { theme: string }) {
  const refs = useRef<(HTMLImageElement | null)[]>([]);
  const dir = charDir(theme);
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const seeds = BOOKS.map((_, i) => i * 1.7 + 0.4);
    const tick = (now: number) => {
      const t = now / 1000;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const s = seeds[i];
        // 本の幅に対する %。律の絵が小さく、数 % では止まって見えた（ユーザー）。2つの波を重ねて、同じ動きをくり返さない
        const x = Math.sin(t * 0.9 + s) * 30 + Math.sin(t * 1.7 + s * 2.3) * 12;
        const y = Math.cos(t * 0.73 + s * 1.7) * 34 + Math.cos(t * 1.9 + s * 3.1) * 12;
        const r = Math.sin(t * 0.8 + s) * 12 + (i % 2 ? 6 : -6);
        el.style.transform = `translate(-50%, 50%) translate(${x.toFixed(1)}%, ${y.toFixed(1)}%) rotate(${r.toFixed(1)}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      {BOOKS.map((b, i) => (
        <img
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`book-attendant${b.front ? " front" : ""}`}
          src={`${dir}${b.name}.webp`}
          alt=""
          aria-hidden="true"
          style={{ left: `${50 + b.x}%`, bottom: `calc(25% + ${b.y}%)`, width: `${b.width}%` }}
        />
      ))}
    </>
  );
}
