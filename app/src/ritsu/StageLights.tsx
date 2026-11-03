// 歌姫の舞台照明：色つきの光が画面の奥で首を振り、律にスポットライトが当たる。連続正解で銀テープと紙吹雪が降る。照明は問題文の後ろを通る
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#e8e8f4", "#ffffff", "#c9ccdc", "#ff9ec6", "#9fe8ff", "#ffe28a"];

type Bit = { x: number; y: number; vy: number; vx: number; w: number; h: number; a: number; va: number; p: number; c: string; tape: boolean };
let cheer: (() => void) | null = null;

/** 答えたとき：3問続けて正解するごとに、銀テープを降らせる */
export function stageCheer(streak: number): void {
  if (streak >= 3 && streak % 3 === 0) cheer?.();
}

/** App の一番外に1つ置く。舞台の律が画面にいる間だけ出す */
export function StageLightsHost() {
  const [here, setHere] = useState(false);
  useEffect(() => {
    let gone = 0;
    const clock = window.setInterval(() => {
      if (document.querySelector(".perch.stage")) {
        gone = 0;
        setHere(true);
      } else if (++gone >= 3) {
        setHere(false);
      }
    }, 300);
    return () => window.clearInterval(clock);
  }, []);
  return here ? <StageLights /> : null;
}

function StageLights() {
  const spot = useRef<HTMLElement>(null);
  const tape = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // スポットライトは律の上に。律は画面ごとに位置が変わるので、ときどき合わせ直す
    const aim = () => {
      const r = document.querySelector(".perch.stage .cape-figure")?.getBoundingClientRect();
      if (!spot.current) return;
      spot.current.style.opacity = r ? "1" : "0";
      if (r) {
        const w = r.width * 2;
        spot.current.style.width = `${w}px`;
        spot.current.style.left = `${r.left + r.width / 2 - w / 2}px`;
        spot.current.style.height = `${r.bottom}px`;
      }
    };
    aim();
    const clock = window.setInterval(aim, 400);
    let bits: Bit[] = [];
    let raf = 0;
    let running = false;
    let last = 0;
    const loop = (n: number) => {
      const cv = tape.current;
      const c = cv?.getContext("2d");
      if (!cv || !c) return;
      const dt = Math.min(0.05, (n - last) / 1000);
      last = n;
      const W = innerWidth;
      const H = innerHeight;
      c.clearRect(0, 0, W, H);
      bits = bits.filter((b) => b.y < H + 90);
      for (const b of bits) {
        b.y += b.vy * dt;
        b.x += (b.vx + Math.sin(b.p + b.y * 0.02) * 22) * dt;
        b.a += b.va * dt;
        c.save();
        c.translate(b.x, b.y);
        if (b.tape) {
          c.strokeStyle = b.c;
          c.lineWidth = b.w * 0.55;
          c.lineCap = "round";
          c.beginPath();
          for (let s = 0; s <= 10; s++) {
            const y = (s / 10) * b.h - b.h / 2;
            const x = Math.sin(s * 0.9 + b.p + n / 260) * 9;
            if (s) c.lineTo(x, y);
            else c.moveTo(x, y);
          }
          c.stroke();
        } else {
          c.rotate(b.a);
          c.scale(1, Math.abs(Math.cos(b.p + n / 190)) * 0.8 + 0.2);
          c.fillStyle = b.c;
          c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
        c.restore();
      }
      if (bits.length) {
        raf = requestAnimationFrame(loop);
      } else {
        running = false;
        c.clearRect(0, 0, W, H);
      }
    };
    cheer = () => {
      const cv = tape.current;
      if (reduced() || !cv) return;
      const r = Math.min(devicePixelRatio || 1, 2);
      cv.width = innerWidth * r;
      cv.height = innerHeight * r;
      cv.getContext("2d")?.setTransform(r, 0, 0, r, 0, 0);
      for (let i = 0; i < 70; i++) {
        const isTape = i % 3 === 0;
        bits.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.7, vy: isTape ? 70 + Math.random() * 50 : 90 + Math.random() * 90, vx: (Math.random() - 0.5) * 26, w: isTape ? 7 : 5 + Math.random() * 4, h: isTape ? 70 + Math.random() * 60 : 8, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 3.2, p: Math.random() * 6.28, c: isTape ? COLORS[i % 3] : COLORS[Math.floor(Math.random() * 6)], tape: isTape });
      }
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    return () => {
      cheer = null;
      window.clearInterval(clock);
      cancelAnimationFrame(raf);
    };
  }, []);

  // 銀テープは答えのあとに降る。その画面は解説の枠で埋まるので、奥に置くと見えない。手前に置いて、押す操作はじゃましない
  return createPortal(
    <>
    <div className="stage-lights" aria-hidden="true">
      <i className="stage-beam b1" />
      <i className="stage-beam b2" />
      <i className="stage-beam b3" />
      <i ref={spot} className="stage-spot" />
    </div>
    <canvas ref={tape} className="stage-tape" aria-hidden="true" />
    </>,
    document.body,
  );
}
