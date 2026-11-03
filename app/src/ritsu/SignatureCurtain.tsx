// 全画面の技（舞台の歌姫「アンコール」）：今の画面の手前に本物の幕が下り、開くと満員の舞台。動画ではなく、描いた絵をコードで動かす
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";
import { fxOn } from "./fx";
import { HOLD, markSignatureSeen } from "./Signature";

const COLORS = ["#ff5fa8", "#7fe3ff", "#ffe36a", "#c79bff"];

/** 音は手元で合成する（素材を使わない）。幕の音・太鼓・和音・歓声 */
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
  const noise = (at: number, dur: number, type: BiquadFilterType, hz: number, peak: number, q = 1) => {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + Math.min(0.3, dur * 0.3));
    g.gain.setValueAtTime(peak, t0 + at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0 + at);
  };
  const thud = (at: number, hz: number, peak: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(hz, t0 + at);
    o.frequency.exponentialRampToValueAtTime(hz * 0.4, t0 + at + 0.3);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.4);
    o.connect(g).connect(master);
    o.start(t0 + at);
    o.stop(t0 + at + 0.45);
  };
  const note = (at: number, hz: number, dur: number, peak: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g).connect(master);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.02);
  };
  const late = HOLD / 1000;
  noise(0, 0.5, "lowpass", 900, 0.3);
  thud(0.48, 120, 0.9);
  for (let i = 0; i < 14; i++) thud(0.62 + i * 0.055, 180, 0.16 + i * 0.016);
  thud(1.42, 90, 0.9);
  [523, 659, 784, 1047].forEach((h) => note(1.42, h, 1.5, 0.14));
  [587, 740, 880, 1175].forEach((h) => note(2.1, h, 1.2, 0.12));
  noise(1.5, 1.9 + late, "bandpass", 1500, 0.28, 0.6);
  thud(3.25 + late, 110, 0.7);
  noise(3.6 + late, 0.45, "lowpass", 900, 0.25);
  return () => {
    master.gain.setTargetAtTime(0, c.currentTime, 0.04);
    window.setTimeout(() => void c.close().catch(() => undefined), 400);
  };
}

type Light = { x: number; y: number; s: number; len: number; p: number };
type Paper = { x: number; y: number; vx: number; vy: number; a: number; va: number; s: number; c: string };

export function CurtainLayer({ theme, onEnd }: { theme: string; onEnd: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLCanvasElement>(null);
  const crowd = useRef<HTMLCanvasElement>(null);
  const conf = useRef<HTMLCanvasElement>(null);
  const pose = useRef<HTMLCanvasElement>(null);
  const poseWrap = useRef<HTMLDivElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const curL = useRef<HTMLDivElement>(null);
  const curR = useRef<HTMLDivElement>(null);
  const valance = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);
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
      for (const c of [beam.current, crowd.current, conf.current]) {
        if (c) {
          c.width = W;
          c.height = H;
        }
      }
      const lights: Light[] = [];
      for (let row = 0; row < 9; row++) {
        const n = Math.round(22 + row * 3);
        for (let i = 0; i < n; i++) lights.push({ x: ((i + 0.5 + (row % 2) * 0.5) / n) * W * 1.08 - W * 0.04, y: H * (0.8 + row * 0.024) + Math.random() * 4 * r, s: (1.4 + row * 0.5) * r, len: (8 + row * 2.4) * r, p: (i / n) * 6.283 * 2 + row * 0.4 });
      }
      const papers: Paper[] = [];
      const burst = () => {
        for (let i = 0; i < 170; i++) {
          const side = i % 2;
          const a = side ? -2.2 + Math.random() * 0.7 : -1.45 + Math.random() * 0.7;
          const sp = (9 + Math.random() * 12) * r;
          papers.push({ x: side ? W * 1.02 : -W * 0.02, y: H * 0.62, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, s: (2.2 + Math.random() * 3) * r, c: ["#ff5fa8", "#ffe36a", "#7fe3ff", "#fff", "#c79bff"][i % 5] });
        }
      };
      let beams = false;
      let bright = 0;
      let amp = 0;
      const wind = makeWind();
      let last = performance.now();
      const tick = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const t = now / 1000;
        const w = wind.step(dt);
        warp?.draw(Math.min(1, w.gust + 0.4), w.phi * 1.4, amp);
        const b = beam.current?.getContext("2d");
        if (b) {
          b.clearRect(0, 0, W, H);
          if (beams) {
            b.globalCompositeOperation = "lighter";
            ([["#ff6fb5", 0.08], ["#7fe3ff", 0.28], ["#fff1b0", 0.5], ["#c79bff", 0.72], ["#ff6fb5", 0.92]] as [string, number][]).forEach(([col, x], i) => {
              const a = Math.sin(t * 1.5 + i * 1.4) * 0.36;
              const tx = x * W + Math.tan(a) * H * 0.75;
              const hw = W * 0.1;
              const g = b.createLinearGradient(x * W, 0, tx, H * 0.78);
              g.addColorStop(0, `${col}aa`);
              g.addColorStop(1, `${col}00`);
              b.fillStyle = g;
              b.beginPath();
              b.moveTo(x * W - 6 * r, 0);
              b.lineTo(x * W + 6 * r, 0);
              b.lineTo(tx + hw, H * 0.78);
              b.lineTo(tx - hw, H * 0.78);
              b.closePath();
              b.fill();
            });
            b.globalCompositeOperation = "source-over";
          }
        }
        const d = crowd.current?.getContext("2d");
        if (d) {
          d.clearRect(0, 0, W, H);
          const dark = d.createLinearGradient(0, H * 0.76, 0, H);
          dark.addColorStop(0, "#05030c00");
          dark.addColorStop(0.2, "#05030ce6");
          dark.addColorStop(1, "#020106");
          d.fillStyle = dark;
          d.fillRect(0, H * 0.76, W, H * 0.24);
          d.lineCap = "round";
          d.strokeStyle = COLORS[Math.floor(t * 1.3) % COLORS.length];
          if (bright > 0) {
            for (const l of lights) {
              const sw = Math.sin(t * 5.2 + l.p);
              d.globalAlpha = bright * (0.65 + 0.35 * sw);
              d.lineWidth = l.s;
              d.beginPath();
              d.moveTo(l.x, l.y);
              d.lineTo(l.x + sw * l.len * 0.55, l.y - l.len);
              d.stroke();
            }
          }
          d.globalAlpha = 1;
        }
        const e = conf.current?.getContext("2d");
        if (e) {
          e.clearRect(0, 0, W, H);
          for (let i = papers.length - 1; i >= 0; i--) {
            const q = papers[i];
            q.vy += 0.13 * r;
            q.x += q.vx;
            q.y += q.vy;
            q.a += q.va;
            e.save();
            e.translate(q.x, q.y);
            e.rotate(q.a);
            e.scale(1, Math.abs(Math.cos(q.a * 1.7)));
            e.fillStyle = q.c;
            e.fillRect(-q.s, -q.s * 0.6, q.s * 2, q.s * 1.2);
            e.restore();
            if (q.y > H + 20) papers.splice(i, 1);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      if (fxOn("sound")) stopSound = playSound();
      const anim = (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(kf, { fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
      const open = "translateX(-92%) scaleX(.72)";
      const openR = "translateX(92%) scaleX(.72)";
      // 1. 今の画面の手前に、幕が下りる
      anim(curtain.current, [{ transform: "translateY(-104%)" }, { transform: "translateY(0)", offset: 0.82 }, { transform: "translateY(-2.2%)", offset: 0.92 }, { transform: "translateY(0)" }], { duration: 620, easing: "cubic-bezier(.5,.02,.7,.5)" });
      anim(valance.current, [{ transform: "translateY(-110%)" }, { transform: "translateY(0)" }], { duration: 460 });
      // 2. 幕にスポットライト。技の名前
      later(640, () => {
        anim(spot.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        anim(name.current, [{ opacity: 0, transform: "translateY(-44%) scale(.86)" }, { opacity: 1, transform: "translateY(-50%) scale(1)" }], { duration: 320 });
      });
      // 3. 幕が開くと、満員の舞台
      later(1400, () => {
        if (stage.current) stage.current.style.opacity = "1";
        beams = true;
        bright = 1;
        amp = 0.9;
        anim(spot.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
        anim(name.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
        anim(curL.current, [{ transform: "translateX(0)" }, { transform: open }], { duration: 620, easing: "cubic-bezier(.3,.8,.3,1)" });
        anim(curR.current, [{ transform: "translateX(0)" }, { transform: openR }], { duration: 620, easing: "cubic-bezier(.3,.8,.3,1)" });
        flash.current?.animate([{ opacity: 0.75 }, { opacity: 0 }], { duration: 360, fill: "forwards" });
        anim(
          poseWrap.current,
          [
            { opacity: 0, transform: "translateX(-50%) translateY(14%) scale(.94)" },
            { opacity: 1, transform: "translateX(-50%) translateY(0) scale(1)", offset: 0.18 },
            { opacity: 1, transform: "translateX(-50%) translateY(-1.5%) scale(1.03)" },
          ],
          { duration: 1800 + HOLD },
        );
      });
      later(1520, burst);
      later(2200, burst);
      // 4. 幕が閉じて、上がる
      later(3240 + HOLD, () => {
        anim(curL.current, [{ transform: open }, { transform: "translateX(0)" }], { duration: 340, easing: "cubic-bezier(.5,0,.5,1)" });
        anim(curR.current, [{ transform: openR }, { transform: "translateX(0)" }], { duration: 340, easing: "cubic-bezier(.5,0,.5,1)" });
      });
      later(3620 + HOLD, () => {
        if (stage.current) stage.current.style.opacity = "0";
        beams = false;
        bright = 0;
        anim(curtain.current, [{ transform: "translateY(0)" }, { transform: "translateY(-104%)" }], { duration: 480, easing: "cubic-bezier(.5,0,.3,1)" });
        anim(valance.current, [{ transform: "translateY(0)" }, { transform: "translateY(-110%)" }], { duration: 480 });
      });
      later(4120 + HOLD, () => {
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
    <div className="curtain-fx" role="button" aria-label="飛ばす" onClick={onEnd}>
      <div ref={stage} className="curtain-stage">
        <canvas ref={beam} />
        <div className="curtain-floor" />
        <div ref={poseWrap} className="curtain-pose">
          <canvas ref={pose} />
        </div>
        <canvas ref={crowd} />
        <canvas ref={conf} />
      </div>
      <div ref={curtain} className="curtain-cloth">
        <div ref={curL} className="curtain-side left" />
        <div ref={curR} className="curtain-side right" />
        <div ref={spot} className="curtain-spot" />
        <div ref={name} className="curtain-name">
          アンコール
        </div>
      </div>
      <div ref={valance} className="curtain-valance" />
      <div ref={flash} className="curtain-flash" />
      <span className="signature-skip">押すと飛ばせます</span>
    </div>,
    document.body,
  );
}
