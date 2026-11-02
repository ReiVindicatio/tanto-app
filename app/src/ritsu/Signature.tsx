// 全画面の技（衣装ごとに別物。今は星詠みの「裁定の流星」）。動画ではなく、描いた絵をコードで動かす。押すと飛ばせる
import { useEffect, useRef } from "react";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";

const SEEN_KEY = "tanto.special.signature.seen.v1";

/** 押せることを知らせる印を、まだ出すか */
export function signatureSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 覚えられなくても動く
  }
}

function drawSky(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext("2d");
  if (!c) return;
  const { width: w, height: h } = canvas;
  const r = Math.min(devicePixelRatio || 1, 2);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#060820");
  g.addColorStop(0.6, "#141a55");
  g.addColorStop(1, "#33296f");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++) {
    c.globalAlpha = Math.random() * 0.7 + 0.2;
    c.fillStyle = "#fff6d8";
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h, (Math.random() * 1.5 + 0.3) * r, 0, 7);
    c.fill();
  }
  // 星図の線
  c.globalAlpha = 0.32;
  c.strokeStyle = "#e8c35a";
  c.lineWidth = r;
  const R = Math.min(w, h) * 0.47;
  for (const k of [1, 0.72]) {
    c.beginPath();
    c.arc(w / 2, h / 2, R * k, 0, 7);
    c.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    c.beginPath();
    c.moveTo(w / 2 + Math.cos(a) * R * 0.72, h / 2 + Math.sin(a) * R * 0.72);
    c.lineTo(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R);
    c.stroke();
  }
  c.globalAlpha = 1;
}

type Meteor = { x: number; y: number; v: number; len: number; w: number };

export function SignatureLayer({ theme, onEnd }: { theme: string; onEnd: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLCanvasElement>(null);
  const rain = useRef<HTMLCanvasElement>(null);
  const pose = useRef<HTMLCanvasElement>(null);
  const poseWrap = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dir = charDir(theme);

  useEffect(() => {
    markSeen();
    let stop = false;
    let raf = 0;
    let warp: Warp | null = null;
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    const fit = (c: HTMLCanvasElement | null) => {
      if (!c) return;
      const r = Math.min(devicePixelRatio || 1, 2);
      c.width = innerWidth * r;
      c.height = innerHeight * r;
    };
    const finishNow = () => {
      if (!stop) onEnd();
    };
    void (async () => {
      try {
        const [face, img, map] = await Promise.all([loadImage(`${dir}cutin.webp`), loadImage(`${dir}keypose.webp`), loadImage(`${dir}keypose-map.png`)]);
        if (stop || !pose.current || !band.current) return;
        const holder = band.current.querySelector("img");
        if (holder) holder.src = face.src;
        warp = makeWarp(pose.current, img, map, [0.25, -0.97]);
        if (!warp) {
          const c = pose.current.getContext("2d");
          c?.drawImage(img, 0, 0, pose.current.width, pose.current.height);
        }
      } catch {
        finishNow();
        return;
      }
      fit(sky.current);
      fit(rain.current);
      if (sky.current) drawSky(sky.current);
      const meteors: Meteor[] = [];
      let rainOn = false;
      let amp = 0;
      let lastSpawn = 0;
      let last = performance.now();
      const wind = makeWind();
      const r = Math.min(devicePixelRatio || 1, 2);
      const spawn = () => {
        const c = rain.current;
        if (!c) return;
        const big = Math.random() < 0.18;
        meteors.push({ x: Math.random() * c.width * 1.3, y: -Math.random() * c.height * 0.3, v: (big ? 26 : 16 + Math.random() * 10) * r, len: (big ? 300 : 90 + Math.random() * 130) * r, w: (big ? 3.4 : 1.2 + Math.random() * 1.2) * r });
      };
      const tick = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const { gust, phi } = wind.step(dt);
        warp?.draw(Math.min(1, gust + 0.5), phi * 1.6, amp);
        const cv = rain.current;
        const c = cv?.getContext("2d");
        if (cv && c) {
          c.clearRect(0, 0, cv.width, cv.height);
          c.globalCompositeOperation = "lighter";
          const dx = -0.55;
          const dy = 0.84;
          for (let i = meteors.length - 1; i >= 0; i--) {
            const m = meteors[i];
            m.x += dx * m.v;
            m.y += dy * m.v;
            const tx = m.x - dx * m.len;
            const ty = m.y - dy * m.len;
            const g = c.createLinearGradient(m.x, m.y, tx, ty);
            g.addColorStop(0, "#fff8dc");
            g.addColorStop(0.25, "#ffe28a");
            g.addColorStop(1, "#ffe28a00");
            c.strokeStyle = g;
            c.lineWidth = m.w;
            c.lineCap = "round";
            c.beginPath();
            c.moveTo(m.x, m.y);
            c.lineTo(tx, ty);
            c.stroke();
            c.fillStyle = "#fffbe8";
            c.beginPath();
            c.arc(m.x, m.y, m.w * 1.2, 0, 7);
            c.fill();
            if (ty > cv.height || m.x < -m.len) meteors.splice(i, 1);
          }
          c.globalCompositeOperation = "source-over";
          if (rainOn && now - lastSpawn > 26) {
            spawn();
            spawn();
            lastSpawn = now;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const anim = (el: Element | null, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(kf, { fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
      anim(sky.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      // 1. 顔が切り込む
      later(180, () =>
        anim(
          band.current,
          [
            { opacity: 1, transform: "translate(70%,-50%) rotate(-7deg)" },
            { opacity: 1, transform: "translate(0,-50%) rotate(-7deg)", offset: 0.22 },
            { opacity: 1, transform: "translate(-3%,-50%) rotate(-7deg)", offset: 0.86 },
            { opacity: 0, transform: "translate(-90%,-50%) rotate(-7deg)" },
          ],
          { duration: 1050, easing: "cubic-bezier(.16,.84,.3,1)" },
        ),
      );
      // 2. 光って、マントを翻す決めの絵
      later(1130, () => {
        flash.current?.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 320, fill: "forwards" });
        root.current?.animate([{ transform: "translate(0,0)" }, { transform: "translate(-7px,5px)" }, { transform: "translate(6px,-4px)" }, { transform: "translate(-3px,2px)" }, { transform: "translate(0,0)" }], { duration: 260 });
        amp = 1.9;
        anim(
          poseWrap.current,
          [
            { opacity: 0, transform: "translate(-50%,-50%) scale(1.28)" },
            { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.16 },
            { opacity: 1, transform: "translate(-50%,-50%) scale(.965)" },
          ],
          { duration: 2000 },
        );
        rainOn = true;
      });
      for (let i = 0; i < 14; i++) later(1250 + i * 90, () => (amp = Math.max(0.75, amp - 0.09)));
      // 3. 最後に光って戻る
      later(2900, () => {
        rainOn = false;
        anim(flash.current, [{ opacity: 0 }, { opacity: 0.9 }], { duration: 240 });
      });
      later(3140, () => {
        if (poseWrap.current) poseWrap.current.style.visibility = "hidden";
        const a = root.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, fill: "forwards" });
        if (a) a.onfinish = finishNow;
        else finishNow();
      });
      later(6000, finishNow); // 止まったときの見切り
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      warp?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  return (
    <div ref={root} className="signature" role="button" aria-label="飛ばす" onClick={onEnd}>
      <canvas ref={sky} className="signature-fill" />
      <div ref={poseWrap} className="signature-pose">
        <canvas ref={pose} />
      </div>
      <canvas ref={rain} className="signature-fill" />
      <div ref={band} className="signature-band">
        <img alt="" />
        <div className="signature-name">裁定の流星</div>
      </div>
      <div ref={flash} className="signature-flash" />
      <div className="signature-skip">押すと飛ばせます</div>
    </div>
  );
}
