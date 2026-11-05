// 全画面の技（深紅のロッカー「紅雷の一撃」）：画面が暗くなり、一度鳴らすと赤い稲妻が走って全体が揺れる。動画ではなく、描いた絵をコードで動かす
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";
import { fxOn } from "./fx";
import { HOLD, markSignatureSeen } from "./Signature";

/** 音は手元で合成する（素材を使わない）。歪ませたギターの和音と、雷の音 */
function playSound(): () => void {
  let c: AudioContext;
  try {
    c = new AudioContext();
    void c.resume();
  } catch {
    return () => undefined;
  }
  const master = c.createGain();
  master.gain.value = 0.42;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.02;
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 512 - 1) * 8;
    curve[i] = Math.tanh(x);
  }
  const drive = c.createWaveShaper();
  drive.curve = curve;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  drive.connect(tone).connect(master);
  const chord = (at: number, hzs: number[], dur: number) => {
    for (const hz of hzs) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.26, t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(drive);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  };
  const thunder = (at: number, dur: number, peak: number) => {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2400, t0 + at);
    f.frequency.exponentialRampToValueAtTime(140, t0 + at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0 + at);
  };
  const late = HOLD / 1000;
  thunder(0.62, 1.6, 0.8);
  chord(0.62, [82.4, 123.5, 164.8], 1.3);
  chord(1.55, [98, 146.8, 196], 0.42);
  chord(1.98, [82.4, 123.5, 164.8], 1.1 + late);
  return () => {
    master.gain.setTargetAtTime(0, c.currentTime, 0.04);
    window.setTimeout(() => void c.close().catch(() => undefined), 400);
  };
}

type Strike = { pts: [number, number][]; life: number; age: number; w: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

/** 上から下へ走る、ぎざぎざの稲妻 */
function makeStrike(W: number, H: number, r: number, x0: number, x1: number, w: number): Strike {
  const n = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const jag = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * (0.05 + Math.random() * 0.09) * W;
    pts.push([x0 + (x1 - x0) * k + jag, -10 * r + k * (H * 0.92)]);
  }
  return { pts, life: 0.42, age: 0, w: w * r };
}

export function BoltLayer({ theme, onEnd }: { theme: string; onEnd: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLCanvasElement>(null);
  const pose = useRef<HTMLCanvasElement>(null);
  const poseWrap = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dir = charDir(theme);

  useEffect(() => {
    markSignatureSeen();
    let stop = false;
    let raf = 0;
    let warp: Warp | null = null;
    let stopSound: (() => void) | undefined;
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    void (async () => {
      try {
        const [img, map] = await Promise.all([loadImage(`${dir}keypose.webp`), loadImage(`${dir}keypose-map.png`)]);
        if (stop || !pose.current) return;
        warp = makeWarp(pose.current, img, map, [1, 0]);
        if (!warp) pose.current.getContext("2d")?.drawImage(img, 0, 0, pose.current.width, pose.current.height);
      } catch {
        if (!stop) onEnd();
        return;
      }
      const r = Math.min(devicePixelRatio || 1, 2);
      const W = innerWidth * r;
      const H = innerHeight * r;
      if (sky.current) {
        sky.current.width = W;
        sky.current.height = H;
      }
      root.current?.classList.add("on");
      const strikes: Strike[] = [];
      const sparks: Spark[] = [];
      const rain = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, l: (10 + Math.random() * 22) * r, v: (10 + Math.random() * 8) * r }));
      const strike = (x0: number, x1: number, w: number) => {
        strikes.push(makeStrike(W, H, r, x0 * W, x1 * W, w));
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * 6.283;
          const sp = (2 + Math.random() * 9) * r;
          sparks.push({ x: x1 * W, y: H * 0.86, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4 * r, life: 0.5 + Math.random() * 0.7 });
        }
      };
      let amp = 0;
      let quake = 0;
      const wind = makeWind();
      let last = performance.now();
      const tick = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const w = wind.step(dt);
        warp?.draw(Math.min(1, w.gust + 0.4), w.phi * 1.4, amp);
        quake = Math.max(0, quake - dt * 2.6);
        if (stage.current) stage.current.style.transform = quake > 0 ? `translate(${(Math.random() - 0.5) * 22 * quake}px, ${(Math.random() - 0.5) * 22 * quake}px)` : "";
        const c = sky.current?.getContext("2d");
        if (c) {
          c.clearRect(0, 0, W, H);
          c.strokeStyle = "#d8dfe9";
          c.lineWidth = 1 * r;
          c.globalAlpha = 0.16;
          for (const d of rain) {
            d.y += d.v;
            if (d.y > H) {
              d.y = -d.l;
              d.x = Math.random() * W;
            }
            c.beginPath();
            c.moveTo(d.x, d.y);
            c.lineTo(d.x - d.l * 0.12, d.y + d.l);
            c.stroke();
          }
          c.globalAlpha = 1;
          c.lineJoin = "miter";
          c.lineCap = "round";
          for (let i = strikes.length - 1; i >= 0; i--) {
            const s = strikes[i];
            s.age += dt;
            if (s.age >= s.life) {
              strikes.splice(i, 1);
              continue;
            }
            const a = (1 - s.age / s.life) * (Math.random() < 0.8 ? 1 : 0.4);
            c.beginPath();
            s.pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
            c.strokeStyle = `rgba(255, 40, 62, ${a * 0.55})`;
            c.lineWidth = s.w * 4;
            c.stroke();
            c.strokeStyle = `rgba(255, 215, 220, ${a})`;
            c.lineWidth = s.w;
            c.stroke();
          }
          c.fillStyle = "#ff8791";
          for (let i = sparks.length - 1; i >= 0; i--) {
            const q = sparks[i];
            q.life -= dt;
            if (q.life <= 0) {
              sparks.splice(i, 1);
              continue;
            }
            q.vy += 0.3 * r;
            q.x += q.vx;
            q.y += q.vy;
            c.globalAlpha = Math.min(1, q.life * 2);
            c.fillRect(q.x, q.y, 3 * r, 3 * r);
          }
          c.globalAlpha = 1;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      if (fxOn("sound")) stopSound = playSound();
      const anim = (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(kf, { fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
      const hit = (x0: number, x1: number, w: number, power: number) => {
        strike(x0, x1, w);
        quake = Math.max(quake, power);
        flash.current?.animate([{ opacity: 0.45 * power }, { opacity: 0 }], { duration: 260, fill: "forwards" });
      };
      // 1. 暗くなり、雨だけの路地。そして最初の一撃で、律が現れる
      later(620, () => {
        hit(0.3, 0.52, 7, 1);
        amp = 0.9;
        anim(
          poseWrap.current,
          [
            { opacity: 0, transform: "translateX(-50%) translateY(10%) scale(.9)" },
            { opacity: 1, transform: "translateX(-50%) translateY(0) scale(1.04)", offset: 0.2 },
            { opacity: 1, transform: "translateX(-50%) translateY(-1%) scale(1)" },
          ],
          { duration: 2400 + HOLD },
        );
        anim(name.current, [{ opacity: 0, transform: "scale(1.4)" }, { opacity: 1, transform: "scale(1)" }], { duration: 260 });
      });
      // 2. もう一度鳴らす
      later(1550, () => hit(0.82, 0.68, 4, 0.45));
      later(1980, () => {
        hit(0.72, 0.42, 8, 1);
        later(120, () => hit(0.12, 0.3, 4, 0.5));
      });
      later(2500 + HOLD * 0.5, () => hit(0.55, 0.8, 3, 0.3));
      // 3. 消える
      later(3020 + HOLD, () => {
        anim(poseWrap.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
        anim(name.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 240 });
        root.current?.classList.remove("on");
      });
      later(3360 + HOLD, () => {
        if (!stop) onEnd();
      });
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      warp?.dispose();
      stopSound?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  return createPortal(
    <div ref={root} className="bolt-fx" role="button" aria-label="飛ばす" onClick={onEnd}>
      <div ref={stage} className="bolt-stage">
        <div className="bolt-alley" style={{ backgroundImage: `url(${dir}bg.webp)` }} />
        <canvas ref={sky} />
        <div ref={poseWrap} className="bolt-pose">
          <canvas ref={pose} />
        </div>
        <div ref={name} className="bolt-name">
          紅雷の一撃
        </div>
      </div>
      <div ref={flash} className="bolt-flash" />
      <span className="signature-skip">押すと飛ばせます</span>
    </div>,
    document.body,
  );
}
