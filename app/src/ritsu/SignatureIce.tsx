// 全画面の技（雪花の姫君「氷華」）：今の画面が端から凍り、ひびが入って、本物の画面の破片になって落ちる。奥に夜の氷の城と決めの絵。動画ではなく、描いた絵をコードで動かす
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";
import { fxOn } from "./fx";
import { HOLD, markSignatureSeen } from "./Signature";
import { holdPage } from "./SignaturePages";

/** 音は手元で合成する（素材を使わない）。氷の軋み・割れる音・鈴 */
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
  const noise = (at: number, dur: number, hz: number, peak: number) => {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hz;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0 + at);
  };
  const bell = (at: number, hz: number, dur: number, peak: number) => {
    for (const [ratio, level] of [[1, 1], [2.76, 0.4], [5.4, 0.16]]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = hz * ratio;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak * level, t0 + at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(master);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  };
  for (let i = 0; i < 16; i++) noise(0.05 + i * 0.05, 0.05, 4200, 0.05 + i * 0.012);
  noise(0.86, 0.14, 2500, 0.8);
  noise(1.18, 0.55, 3200, 0.9);
  for (let i = 0; i < 16; i++) bell(1.18 + Math.random() * 0.7, 1800 + Math.random() * 2600, 0.5, 0.05);
  [784, 1047, 1319, 1568].forEach((h, i) => bell(1.9 + i * 0.09, h, 1.8, 0.12));
  return () => {
    master.gain.setTargetAtTime(0, c.currentTime, 0.04);
    window.setTimeout(() => void c.close().catch(() => undefined), 400);
  };
}

type Seg = { x: number; y: number; x2: number; y2: number; d: number; w: number };

/** 霜：画面の端から枝分かれして伸びる線 */
function buildFrost(W: number, H: number, r: number): Seg[] {
  const segs: Seg[] = [];
  const branch = (x: number, y: number, a: number, len: number, d: number) => {
    if (d > 5 || len < 5 * r) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    segs.push({ x, y, x2, y2, d, w: Math.max(0.5, 3.2 - d * 0.5) * r });
    for (const s of [-1, 1]) if (Math.random() < 0.88) branch(x2, y2, a + s * (0.45 + Math.random() * 0.5), len * (0.62 + Math.random() * 0.18), d + 1);
  };
  for (let i = 0; i < 46; i++) {
    const t = Math.random();
    const e = Math.floor(Math.random() * 4);
    const [x, y, a] = e === 0 ? [t * W, 0, Math.PI / 2] : e === 1 ? [t * W, H, -Math.PI / 2] : e === 2 ? [0, t * H, 0] : [W, t * H, Math.PI];
    branch(x, y, a + (Math.random() - 0.5) * 0.8, (46 + Math.random() * 80) * r, 0);
  }
  return segs.sort((p, q) => p.d - q.d + (Math.random() - 0.5) * 0.6);
}

/** 割れる線の中心から端までで、画面を破片に分ける */
function polys(cx: number, cy: number): number[][][] {
  const W = innerWidth;
  const H = innerHeight;
  const N = 11;
  const start = Math.random() * 6.28;
  const pts: number[][] = [];
  for (let i = 0; i < N; i++) {
    const a = start + ((i + Math.random() * 0.6) / N) * 6.283;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = Math.min(dx > 0 ? (W - cx) / dx : dx < 0 ? -cx / dx : 1e9, dy > 0 ? (H - cy) / dy : dy < 0 ? -cy / dy : 1e9);
    pts.push([cx + dx * t, cy + dy * t, a]);
  }
  const corners = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => [x, y, Math.atan2(y - cy, x - cx)]);
  return pts.map((p, i) => {
    const q = pts[(i + 1) % N];
    const norm = (b: number) => {
      let v = b - p[2];
      while (v < 0) v += 6.283;
      return v;
    };
    const span = norm(q[2]);
    const mid = corners.filter((c) => norm(c[2]) < span).sort((u, v) => norm(u[2]) - norm(v[2]));
    return [[cx, cy], [p[0], p[1]], ...mid.map((c) => [c[0], c[1]]), [q[0], q[1]]];
  });
}

export function IceLayer({ theme, onEnd }: { theme: string; onEnd: () => void }) {
  const fx = useRef<HTMLDivElement>(null);
  const snow = useRef<HTMLCanvasElement>(null);
  const pose = useRef<HTMLCanvasElement>(null);
  const poseWrap = useRef<HTMLDivElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const frost = useRef<HTMLCanvasElement>(null);
  const crack = useRef<SVGSVGElement>(null);
  const tint = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dir = charDir(theme);

  useEffect(() => {
    markSignatureSeen();
    let stop = false;
    let raf = 0;
    let amp = 0;
    let warp: Warp | null = null;
    let stopSound: (() => void) | undefined;
    let page: ReturnType<typeof holdPage> = null;
    const shards: HTMLElement[] = [];
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
      page = holdPage();
      const inner = page?.root.firstElementChild as HTMLElement | null;
      const r = Math.min(devicePixelRatio || 1, 2);
      const W = innerWidth * r;
      const H = innerHeight * r;
      for (const c of [frost.current, snow.current]) {
        if (c) {
          c.width = W;
          c.height = H;
        }
      }
      const fc = frost.current?.getContext("2d");
      const segs = buildFrost(W, H, r);
      let drawn = 0;
      const drawFrost = (k: number) => {
        if (!fc) return;
        const target = Math.floor(segs.length * k);
        fc.lineCap = "round";
        for (; drawn < target; drawn++) {
          const s = segs[drawn];
          fc.strokeStyle = `rgba(235,249,255,${0.95 - s.d * 0.09})`;
          fc.lineWidth = s.w;
          fc.shadowColor = "#bfe7ff";
          fc.shadowBlur = 6;
          fc.beginPath();
          fc.moveTo(s.x, s.y);
          fc.lineTo(s.x2, s.y2);
          fc.stroke();
        }
      };
      const flakes = Array.from({ length: 150 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: (1 + Math.random() * 3) * r, v: (0.5 + Math.random() * 1.8) * r, p: Math.random() * 6, glyph: Math.random() < 0.14 }));
      const wind = makeWind();
      let last = performance.now();
      const started = last;
      let growing = true;
      const tick = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (growing) drawFrost(Math.min(1, (now - started) / 780));
        const { gust, phi } = wind.step(dt);
        warp?.draw(Math.min(1, gust + 0.4), phi * 1.4, amp);
        const sc = snow.current?.getContext("2d");
        if (sc) {
          sc.clearRect(0, 0, W, H);
          sc.fillStyle = "#fff";
          sc.textAlign = "center";
          for (const f of flakes) {
            f.y += f.v * dt * 60;
            f.x += Math.sin(f.p + f.y * 0.01) * 0.6;
            if (f.y > H) f.y = -10;
            if (f.glyph) {
              sc.font = `${f.s * 6}px serif`;
              sc.globalAlpha = 0.85;
              sc.fillText("❄", f.x, f.y);
            } else {
              sc.globalAlpha = 0.75;
              sc.beginPath();
              sc.arc(f.x, f.y, f.s, 0, 7);
              sc.fill();
            }
          }
          sc.globalAlpha = 1;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      if (fxOn("sound")) stopSound = playSound();
      const anim = (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(kf, { fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
      // 1. 端から凍る
      anim(tint.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 800 });
      anim(page?.root, [{ filter: "saturate(1) brightness(1)" }, { filter: "saturate(.4) brightness(1.12)" }], { duration: 800 });
      // 2. 中心にひび
      const cx = innerWidth * (0.42 + Math.random() * 0.16);
      const cy = innerHeight * (0.42 + Math.random() * 0.16);
      const ps = polys(cx, cy);
      later(860, () => {
        const svg = crack.current;
        if (svg) {
          svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
          for (const p of ps) {
            const a = p[1];
            let d = `M ${cx} ${cy}`;
            for (let i = 1; i <= 7; i++) {
              const t = i / 7;
              const j = i < 7 ? 18 : 0;
              d += ` L ${cx + (a[0] - cx) * t + (Math.random() - 0.5) * j} ${cy + (a[1] - cy) * t + (Math.random() - 0.5) * j}`;
            }
            const e = document.createElementNS("http://www.w3.org/2000/svg", "path");
            e.setAttribute("d", d);
            e.setAttribute("class", "ice-crack-line");
            e.style.strokeDasharray = "2000";
            svg.appendChild(e);
            e.animate([{ strokeDashoffset: 2000 }, { strokeDashoffset: 0 }], { duration: 240, fill: "forwards", easing: "ease-out" });
          }
        }
        // 揺らすのは #root（body を動かすと、中の position: fixed が body 基準になって画面が一瞬白く飛んだ）
        page?.root.animate([{ transform: "translate(0,0)" }, { transform: "translate(-4px,3px)" }, { transform: "translate(3px,-2px)" }, { transform: "translate(0,0)" }], { duration: 180 });
      });
      // 3. 本物の画面の破片になって落ちる。奥に氷の城と決めの絵
      later(1180, () => {
        growing = false;
        const data = frost.current?.toDataURL("image/png");
        const look = page ? getComputedStyle(page.root).filter : "";
        ps.forEach((p) => {
          const w = document.createElement("div");
          w.className = "ice-shard";
          w.style.clipPath = `polygon(${p.map((q) => `${q[0]}px ${q[1]}px`).join(",")})`;
          w.style.background = getComputedStyle(page?.root ?? document.body).backgroundColor;
          if (inner) {
            const cl = inner.cloneNode(true) as HTMLElement;
            cl.style.filter = look;
            w.appendChild(cl);
          }
          const o = document.createElement("div");
          o.className = "ice-glass";
          if (data) o.style.backgroundImage = `url(${data}), linear-gradient(120deg,#ffffff66,#ffffff00 45%,#bfe7ff55)`;
          w.appendChild(o);
          document.body.appendChild(w);
          shards.push(w);
          const mx = p.reduce((s, q) => s + q[0], 0) / p.length - cx;
          const my = p.reduce((s, q) => s + q[1], 0) / p.length - cy;
          const d = Math.hypot(mx, my) || 1;
          const dx = (mx / d) * (180 + Math.random() * 180);
          const dy = (my / d) * (120 + Math.random() * 120) + innerHeight * (0.5 + Math.random() * 0.35);
          const rz = (Math.random() - 0.5) * 110;
          w.style.transformOrigin = `${cx + mx}px ${cy + my}px`;
          w.animate(
            [
              { transform: "translate(0,0) rotate(0)", opacity: 1 },
              { transform: `translate(${dx * 0.35}px,${dy * 0.12}px) rotate(${rz * 0.3}deg)`, opacity: 1, offset: 0.35 },
              { transform: `translate(${dx}px,${dy}px) rotate(${rz}deg) scale(.9)`, opacity: 0 },
            ],
            { duration: 760 + Math.random() * 260, fill: "forwards", easing: "cubic-bezier(.4,.1,.8,.6)", delay: Math.random() * 70 },
          );
        });
        if (page) page.root.style.visibility = "hidden";
        if (tint.current) tint.current.style.display = "none";
        if (frost.current) frost.current.style.display = "none";
        if (crack.current) crack.current.style.display = "none";
        flash.current?.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 260, fill: "forwards" });
        amp = 0.9;
        anim(bg.current, [{ transform: "scale(1.1)" }, { transform: "scale(1)" }], { duration: 2800 + HOLD, easing: "ease-out" });
        anim(
          poseWrap.current,
          [
            { opacity: 0, transform: "translate(-50%,-46%) scale(.94)" },
            { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.14 },
            { opacity: 1, transform: "translate(-50%,-51.5%) scale(1.03)" },
          ],
          { duration: 2000 + HOLD },
        );
        anim(plate.current, [{ opacity: 0, transform: "translateX(-50%) scale(1.3)" }, { opacity: 1, transform: "translateX(-50%) scale(1)" }], { duration: 420, delay: 260 });
      });
      // 4. 吹雪で白くなって、元の画面へ
      later(3280 + HOLD, () => anim(flash.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: "ease-in" }));
      later(3720 + HOLD, () => {
        shards.forEach((s) => s.remove());
        shards.length = 0;
        if (page) page.root.style.visibility = "";
        page?.root.getAnimations().forEach((a) => a.cancel());
        if (fx.current) fx.current.style.visibility = "hidden";
        anim(flash.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out" });
      });
      later(4180 + HOLD, () => {
        if (!stop) onEnd();
      });
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      warp?.dispose();
      stopSound?.();
      shards.forEach((s) => s.remove());
      page?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  // #root の外に置く（#root を凍らせて隠すので、中に置くと一緒に消える）
  return createPortal(
    <>
      <div ref={fx} className="pages-fx">
        <div ref={bg} className="pages-bg ice-bg" style={{ backgroundImage: `url(${dir}bg.webp)` }} />
        <canvas ref={snow} className="signature-fill" />
        <div ref={poseWrap} className="pages-pose ice-pose">
          <canvas ref={pose} />
        </div>
        <div ref={plate} className="ice-plate">
          氷華
        </div>
      </div>
      <div ref={tint} className="ice-tint" />
      <canvas ref={frost} className="ice-frost" />
      <svg ref={crack} className="ice-frost ice-crack" aria-hidden="true" />
      <div ref={flash} className="signature-flash ice-flash-top" />
      <div className="pages-catch" role="button" aria-label="飛ばす" onClick={onEnd}>
        <span className="signature-skip">押すと飛ばせます</span>
      </div>
    </>,
    document.body,
  );
}
