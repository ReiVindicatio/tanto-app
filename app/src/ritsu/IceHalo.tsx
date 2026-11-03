// 雪花の輪：背中で回る結晶の輪と、ときどき光る杖、耳を折るうさぎ。輪は内と外が逆に回る。数秒ごとに杖が光り、輪に光の波と結晶の粒が広がる
import { useEffect, useRef, type CSSProperties } from "react";
import { charDir } from "../character";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const PULSE = 5200;

/** 六方向の線で結晶の粒を描く */
function drawSpark(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  c.globalAlpha = a;
  c.strokeStyle = "#ffffff";
  c.lineWidth = Math.max(0.7, r * 0.16);
  c.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    const t = (k * Math.PI) / 3;
    c.beginPath();
    c.moveTo(x - Math.cos(t) * r, y - Math.sin(t) * r);
    c.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    c.stroke();
  }
}

export function IceHalo({ theme }: { theme: string }) {
  const dir = charDir(theme);
  const flash = useRef<HTMLDivElement>(null);
  const glint = useRef<HTMLElement>(null);
  const ear = useRef<HTMLImageElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced()) return;
    let stop = false;
    let raf = 0;
    const timers: number[] = [];
    const replay = (el: Element | null) => {
      if (!el) return;
      el.classList.remove("go");
      void (el as HTMLElement).offsetWidth;
      el.classList.add("go");
    };
    const burst = () => {
      const cv = sparks.current;
      const c = cv?.getContext("2d");
      if (!cv || !c) return;
      const r = Math.min(devicePixelRatio || 1, 2);
      const size = cv.clientWidth;
      cv.width = size * r;
      cv.height = size * r;
      c.setTransform(r, 0, 0, r, 0, 0);
      const parts = Array.from({ length: 22 }, () => {
        const t = Math.random() * 6.283;
        const v = 12 + Math.random() * 26;
        const at = size * 0.3 * (0.8 + Math.random() * 0.25);
        return { x: size / 2 + Math.cos(t) * at, y: size / 2 + Math.sin(t) * at, vx: Math.cos(t) * v, vy: Math.sin(t) * v, life: 0, max: 0.9 + Math.random() * 0.9, s: 1.4 + Math.random() * 2.2 };
      });
      let last = performance.now();
      const step = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        c.clearRect(0, 0, size, size);
        let alive = false;
        for (const p of parts) {
          p.life += dt;
          if (p.life > p.max) continue;
          alive = true;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          drawSpark(c, p.x, p.y, p.s, Math.sin((Math.PI * p.life) / p.max));
        }
        c.globalAlpha = 1;
        if (alive) raf = requestAnimationFrame(step);
      };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    };
    const pulse = () => {
      replay(flash.current);
      replay(glint.current);
      burst();
    };
    const fold = () => {
      ear.current?.classList.add("on");
      timers.push(window.setTimeout(() => ear.current?.classList.remove("on"), 900));
      timers.push(window.setTimeout(fold, 5000 + Math.random() * 5000));
    };
    timers.push(window.setTimeout(fold, 3500));
    const clock = window.setInterval(pulse, PULSE);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      window.clearInterval(clock);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <>
      <div className="ice-box ice-back" aria-hidden="true" style={{ "--ring": `url(${dir}ring.webp)` } as CSSProperties}>
        <div className="ice-aura" />
        <div className="ice-halo">
          <i className="outer" />
          <i className="inner" />
          <i className="shine" />
        </div>
        <div ref={flash} className="ice-flash" />
      </div>
      <div className="ice-box ice-front" aria-hidden="true">
        <img ref={ear} className="ice-ear" src={`${dir}ear.webp`} alt="" />
        <i ref={glint} className="ice-glint" />
        <canvas ref={sparks} className="ice-sparks" />
      </div>
    </>
  );
}
