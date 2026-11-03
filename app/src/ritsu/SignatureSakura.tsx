// 全画面の技（合格の袴「桜花爛漫」）：強い風が今の画面ごと吹き飛ばし、満開の並木に。小鳥の群れが飛び立ち、最後の1羽が律の頭にとまる。動画ではなく、描いた絵をコードで動かす
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";
import { fxOn } from "./fx";
import { HOLD, markSignatureSeen } from "./Signature";
import { holdPage } from "./SignaturePages";

/** 決めの絵の中の、頭の上の位置（絵の幅・高さに対する割合） */
const POSE_HEAD: [number, number] = [0.512, 0.174];
const COLORS = ["#f9c1d3", "#f6a9c3", "#fcd9e4", "#f18fb2"];

/** 音は手元で合成する（素材を使わない）。風と、はじく音 */
function playSound(): () => void {
  let c: AudioContext;
  try {
    c = new AudioContext();
    void c.resume();
  } catch {
    return () => undefined;
  }
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.02;
  const wind = (at: number, dur: number, from: number, to: number, peak: number) => {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(from, t0 + at);
    f.frequency.exponentialRampToValueAtTime(to, t0 + at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0 + at);
  };
  const pluck = (at: number, hz: number, peak: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
    o.connect(g).connect(master);
    o.start(t0 + at);
    o.stop(t0 + at + 1.15);
  };
  wind(0, 1.1, 500, 1900, 0.6);
  wind(0.9, 2.4 + HOLD / 1000, 1200, 700, 0.22);
  wind(3.1 + HOLD / 1000, 0.8, 700, 2200, 0.5);
  [587, 659, 784, 880, 988, 1175, 1319].forEach((h, i) => pluck(0.95 + i * 0.13, h, 0.16));
  [784, 988, 1175, 1568].forEach((h) => pluck(1.95, h, 0.15));
  return () => {
    master.gain.setTargetAtTime(0, c.currentTime, 0.04);
    window.setTimeout(() => void c.close().catch(() => undefined), 400);
  };
}

type Petal = { x: number; y: number; s: number; a: number; va: number; f: number; c: string; sp: number; dy: number };
type Bird = { x: number; y: number; vx: number; vy: number; s: number; p: number; last?: boolean; landed?: boolean };

export function SakuraLayer({ theme, onEnd }: { theme: string; onEnd: () => void }) {
  const fx = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const pose = useRef<HTMLCanvasElement>(null);
  const poseWrap = useRef<HTMLDivElement>(null);
  const round = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLImageElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dir = charDir(theme);

  useEffect(() => {
    markSignatureSeen();
    let stop = false;
    let raf = 0;
    let warp: Warp | null = null;
    let stopSound: (() => void) | undefined;
    let page: ReturnType<typeof holdPage> = null;
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    void (async () => {
      let up: HTMLImageElement;
      let down: HTMLImageElement;
      let stand: HTMLImageElement;
      try {
        const [fc, img, map, u, d, st] = await Promise.all(["cutin.webp", "keypose.webp", "keypose-map.png", "bird-up.webp", "bird-down.webp", "bird-stand.webp"].map((f) => loadImage(`${dir}${f}`)));
        up = u;
        down = d;
        stand = st;
        if (stop || !pose.current) return;
        if (face.current) face.current.src = fc.src;
        warp = makeWarp(pose.current, img, map, [1, 0]);
        if (!warp) pose.current.getContext("2d")?.drawImage(img, 0, 0, pose.current.width, pose.current.height);
      } catch {
        if (!stop) onEnd();
        return;
      }
      page = holdPage();
      const r = Math.min(devicePixelRatio || 1, 2);
      const cv = front.current;
      if (!cv) return;
      cv.width = innerWidth * r;
      cv.height = innerHeight * r;
      const W = cv.width;
      const H = cv.height;
      const c = cv.getContext("2d");
      const petals: Petal[] = [];
      const birds: Bird[] = [];
      let rate = 90;
      let gust = 1;
      let big = true;
      let amp = 0;
      let acc = 0;
      const add = () =>
        petals.push({ x: W + Math.random() * W * 0.4, y: Math.random() * H * 1.1 - H * 0.05, s: (big ? 7 + Math.random() * 14 : 3 + Math.random() * 5) * r, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.24, f: Math.random() * 6.28, c: COLORS[Math.floor(Math.random() * 4)], sp: 0.65 + Math.random() * 0.75, dy: (Math.random() - 0.35) * 3 * r });
      const wind = makeWind();
      let last = performance.now();
      const tick = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const w = wind.step(dt);
        warp?.draw(Math.min(1, w.gust + 0.4), w.phi * 1.4, amp);
        if (c) {
          c.clearRect(0, 0, W, H);
          acc += rate * dt;
          while (acc >= 1) {
            add();
            acc--;
          }
          for (let i = petals.length - 1; i >= 0; i--) {
            const p = petals[i];
            p.x -= ((p.sp * gust * 26 * r * dt * 60) / 3);
            p.y += (p.dy * dt * 60) / 2 + Math.sin(p.f) * 0.7 * r;
            p.a += p.va;
            p.f += 0.11;
            c.save();
            c.translate(p.x, p.y);
            c.rotate(p.a);
            c.scale(1, Math.abs(Math.cos(p.f)) * 0.75 + 0.25);
            c.fillStyle = p.c;
            c.beginPath();
            c.moveTo(0, -p.s);
            c.bezierCurveTo(p.s * 0.9, -p.s * 0.9, p.s * 0.9, p.s * 0.5, 0, p.s);
            c.bezierCurveTo(-p.s * 0.9, p.s * 0.5, -p.s * 0.9, -p.s * 0.9, -p.s * 0.14, -p.s * 0.8);
            c.lineTo(0, -p.s * 0.55);
            c.closePath();
            c.fill();
            c.restore();
            if (p.x < -60 * r || p.y > H + 60 * r) petals.splice(i, 1);
          }
          // 小鳥の群れ。最後の1羽は律の頭へ
          for (let i = birds.length - 1; i >= 0; i--) {
            const b = birds[i];
            if (!b.landed) {
              if (b.last) {
                const rect = poseWrap.current?.getBoundingClientRect();
                if (rect) {
                  const tx = (rect.left + rect.width * POSE_HEAD[0]) * r;
                  const ty = (rect.top + rect.height * POSE_HEAD[1]) * r;
                  b.vx += (tx - b.x) * dt * 3.2 - b.vx * dt * 3;
                  b.vy += (ty - b.y) * dt * 3.2 - b.vy * dt * 3;
                  if (Math.hypot(tx - b.x, ty - b.y) < 8 * r) {
                    b.landed = true;
                    b.x = tx;
                    b.y = ty;
                  }
                }
              }
              b.x += b.vx * dt;
              b.y += b.vy * dt + Math.sin(now / 90 + b.p) * r * 0.6;
              if (!b.last && (b.y < -80 * r || b.x > W + 80 * r || b.x < -80 * r)) {
                birds.splice(i, 1);
                continue;
              }
            }
            const im = b.landed ? stand : Math.floor(now / 70 + b.p) % 2 ? up : down;
            c.save();
            c.translate(b.x, b.y);
            if (b.vx > 0 && !b.landed) c.scale(-1, 1);
            c.drawImage(im, -b.s / 2, b.landed ? -b.s : -b.s / 2, b.s, b.s);
            c.restore();
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      if (fxOn("sound")) stopSound = playSound();
      const anim = (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(kf, { fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
      // 1. 右から強い風。花びらが増えて、画面が吹き飛ぶ
      later(160, () => {
        rate = 260;
        gust = 1.5;
      });
      anim(page?.root, [{ transform: "translateX(0) rotate(0)" }, { transform: "translateX(3%) rotate(.6deg)", offset: 0.3 }, { transform: "translateX(-125%) rotate(-9deg) skewY(-3deg)" }], { duration: 760, easing: "cubic-bezier(.6,0,.75,.3)" });
      // 2. 満開の並木。丸窓に顔、技の名前
      later(620, () => {
        rate = 60;
        gust = 0.7;
        anim(bg.current, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 3300 + HOLD, easing: "ease-out" });
      });
      later(860, () => {
        anim(round.current, [{ opacity: 0, transform: "scale(.7) rotate(-8deg)" }, { opacity: 1, transform: "scale(1) rotate(0)" }], { duration: 440 });
        anim(name.current, [{ opacity: 0, transform: "translateY(-44%)" }, { opacity: 1, transform: "translateY(-50%)" }], { duration: 420 });
      });
      // 3. 花びらが舞い、小鳥の群れが飛び立つ。決めの絵
      later(1860, () => {
        rate = 320;
        gust = 1.3;
        amp = 0.9;
        flash.current?.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 420, fill: "forwards" });
        anim(round.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
        anim(name.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
        anim(
          poseWrap.current,
          [
            { opacity: 0, transform: "translate(-50%,-44%) scale(.94)" },
            { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.12 },
            { opacity: 1, transform: "translate(-50%,-51.5%) scale(1.03)" },
          ],
          { duration: 2200 + HOLD },
        );
        for (let i = 0; i < 16; i++) {
          later(i * 45, () => {
            const fromLeft = Math.random() < 0.5;
            birds.push({ x: fromLeft ? -30 * r : W + 30 * r, y: H * (0.45 + Math.random() * 0.6), vx: (fromLeft ? 1 : -1) * (180 + Math.random() * 260) * r, vy: -(220 + Math.random() * 300) * r, s: (38 + Math.random() * 34) * r, p: Math.random() * 20 });
          });
        }
      });
      later(2280, () => {
        rate = 26;
        gust = 0.7;
        big = false;
      });
      later(2500, () => birds.push({ x: W * 0.92, y: H * 0.9, vx: -120 * r, vy: -260 * r, s: 46 * r, p: 3, last: true }));
      // 4. もう一度の風で、画面が戻る
      later(3120 + HOLD, () => {
        big = true;
        rate = 300;
        gust = 1.6;
      });
      later(3260 + HOLD, () => anim(page?.root, [{ transform: "translateX(125%) rotate(7deg)" }, { transform: "translateX(0) rotate(0)" }], { duration: 620, easing: "cubic-bezier(.2,.8,.3,1)" }));
      later(3620 + HOLD, () => {
        rate = 0;
        gust = 1.8;
      });
      later(4000 + HOLD, () => {
        if (!stop) onEnd();
      });
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      warp?.dispose();
      stopSound?.();
      page?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  // #root の外に置く（#root を吹き飛ばすので、中に置くと一緒に飛ぶ）
  return createPortal(
    <>
      <div ref={fx} className="pages-fx">
        <div ref={bg} className="pages-bg sakura-bg" style={{ backgroundImage: `url(${dir}bg.webp)` }} />
        <div ref={poseWrap} className="pages-pose sakura-pose">
          <canvas ref={pose} />
        </div>
        <div ref={round} className="sakura-round">
          <img ref={face} alt="" />
        </div>
        <div ref={name} className="sakura-name">
          桜花爛漫
        </div>
      </div>
      <canvas ref={front} className="ice-frost" />
      <div ref={flash} className="signature-flash ice-flash-top sakura-flash" />
      <div className="pages-catch" role="button" aria-label="飛ばす" onClick={onEnd}>
        <span className="signature-skip">押すと飛ばせます</span>
      </div>
    </>,
    document.body,
  );
}
