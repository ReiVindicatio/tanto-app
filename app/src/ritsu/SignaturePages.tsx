// 全画面の技（夜想の司書「万巻の開架」）：今の画面そのものが紙のようにめくれ、奥の夜の図書館が現れる。動画ではなく、描いた絵をコードで動かす
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";
import { fxOn } from "./fx";
import { markSignatureSeen } from "./Signature";

/** 音は手元で合成する（素材を使わない）。紙のめくれる音と鈴 */
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
  const flutter = (at: number, dur: number, hz: number, peak: number) => {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(Math.abs(Math.sin((i / c.sampleRate) * Math.PI * 14)), 3);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hz;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0 + at);
  };
  const bell = (at: number, hz: number, dur: number, peak: number) => {
    for (const [ratio, level] of [[1, 1], [2.76, 0.3], [5.4, 0.08]]) {
      const o = c.createOscillator();
      o.frequency.value = hz * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak * level, t0 + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(master);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  };
  flutter(0, 0.7, 1800, 0.5);
  flutter(0.5, 1, 2600, 0.25);
  [370, 440, 554].forEach((hz, i) => bell(0.95 + i * 0.12, hz, 1.6, 0.11));
  bell(1.8, 880, 1.8, 0.2);
  bell(1.8, 1319, 1.6, 0.1);
  flutter(3, 0.8, 1800, 0.45);
  return () => {
    master.gain.setTargetAtTime(0, c.currentTime, 0.04);
    window.setTimeout(() => void c.close().catch(() => undefined), 400);
  };
}

/** 画面全体をめくれる形にする。#root に transform をかけると中の position: fixed（タブなど）が #root 基準になるので、
 *  #root を画面の大きさに固定し、中身だけスクロールの分ずらす。戻す関数を返す */
function holdPage(): { root: HTMLElement; shade: HTMLElement; release: () => void } | null {
  const root = document.getElementById("root");
  const inner = root?.firstElementChild as HTMLElement | null;
  if (!root || !inner) return null;
  const y = window.scrollY;
  const bg = getComputedStyle(document.body).backgroundColor;
  const saved = root.getAttribute("style");
  const savedInner = inner.getAttribute("style");
  root.style.cssText += `;position:fixed;inset:0;overflow:hidden;z-index:1;transform-origin:left center;backface-visibility:hidden;background:${bg === "rgba(0, 0, 0, 0)" ? "var(--bg)" : bg}`;
  inner.style.position = "relative";
  inner.style.top = `${-y}px`;
  const shade = document.createElement("div");
  shade.style.cssText = "position:absolute;inset:0;z-index:9999;pointer-events:none;opacity:0;background:linear-gradient(90deg,#0000 0%,#0006 55%,#000c 100%)";
  root.appendChild(shade);
  return {
    root,
    shade,
    release() {
      root.getAnimations().forEach((a) => a.cancel());
      shade.remove();
      if (saved === null) root.removeAttribute("style");
      else root.setAttribute("style", saved);
      if (savedInner === null) inner.removeAttribute("style");
      else inner.setAttribute("style", savedInner);
      window.scrollTo(0, y);
    },
  };
}

type Item = { name: string; book: boolean; x: number; y: number; vx: number; vy: number; a: number; R: number; vR: number; va: number; s: number; rot: number; vr: number; flip: number; front: boolean };

export function PagesLayer({ theme, onEnd }: { theme: string; onEnd: () => void }) {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const pose = useRef<HTMLCanvasElement>(null);
  const poseWrap = useRef<HTMLDivElement>(null);
  const spread = useRef<HTMLDivElement>(null);
  const leafL = useRef<HTMLDivElement>(null);
  const leafR = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const ray = useRef<HTMLDivElement>(null);
  const faceImg = useRef<HTMLImageElement>(null);
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
      const images: Record<string, HTMLImageElement> = {};
      try {
        const names = ["book-closed", "book-closed2", "book-open", "page"];
        const [face, img, map, ...sprites] = await Promise.all([loadImage(`${dir}cutin.webp`), loadImage(`${dir}keypose.webp`), loadImage(`${dir}keypose-map.png`), ...names.map((n) => loadImage(`${dir}${n}.webp`))]);
        names.forEach((n, i) => (images[n] = sprites[i]));
        if (stop || !pose.current) return;
        if (faceImg.current) faceImg.current.src = face.src;
        warp = makeWarp(pose.current, img, map, [0, -1]);
        if (!warp) pose.current.getContext("2d")?.drawImage(img, 0, 0, pose.current.width, pose.current.height);
      } catch {
        if (!stop) onEnd();
        return;
      }
      page = holdPage();
      const r = Math.min(devicePixelRatio || 1, 2);
      for (const c of [back.current, front.current]) {
        if (c) {
          c.width = innerWidth * r;
          c.height = innerHeight * r;
        }
      }
      const W = innerWidth * r;
      const H = innerHeight * r;
      const items: Item[] = [];
      const addBook = () => {
        const n = ["book-closed", "book-closed2", "book-open"][Math.floor(Math.random() * 3)];
        items.push({ name: n, book: true, x: 0, y: 0, vx: 0, vy: 0, a: Math.random() * 6.283, R: 40 * r, vR: (1.6 + Math.random() * 2.2) * r, va: 0.018 + Math.random() * 0.024, s: (0.35 + Math.random() * 0.55) * r, rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 0.05, flip: 0, front: false }); // 本は決めの絵より奥（顔に重ならない）
      };
      const addPage = (up: boolean) =>
        items.push({ name: "page", book: false, x: Math.random() * W, y: up ? H + Math.random() * H * 0.5 : -40 * r - Math.random() * H * 0.3, vx: (Math.random() - 0.5) * 5 * r, vy: (up ? -(20 + Math.random() * 16) : 5 + Math.random() * 7) * r, a: 0, R: 0, vR: 0, va: 0, s: (up ? 1.2 + Math.random() * 1.6 : 0.35 + Math.random() * 0.55) * r, rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 0.14, flip: Math.random() * 6.283, front: true });
      let amp = 0;
      let last = performance.now();
      const wind = makeWind();
      const tick = (now: number) => {
        if (stop) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const { gust, phi } = wind.step(dt);
        warp?.draw(Math.min(1, gust + 0.4), phi * 1.4, amp);
        const bc = back.current?.getContext("2d");
        const fc = front.current?.getContext("2d");
        if (bc && fc) {
          bc.clearRect(0, 0, W, H);
          fc.clearRect(0, 0, W, H);
          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            const c = it.front ? fc : bc;
            const im = images[it.name];
            let x: number;
            let y: number;
            if (it.book) {
              it.a += it.va;
              it.R += it.vR * (it.R < Math.min(W, H) * 0.46 ? 1 : 0.05);
              x = W / 2 + Math.cos(it.a) * it.R * 1.05;
              y = H / 2 + Math.sin(it.a) * it.R * 0.86;
            } else {
              it.x += it.vx;
              it.y += it.vy;
              it.flip += 0.13;
              x = it.x;
              y = it.y;
            }
            it.rot += it.vr;
            c.save();
            c.translate(x, y);
            c.rotate(it.rot);
            c.scale(it.s, it.s * (it.book ? 1 : Math.abs(Math.cos(it.flip)) * 0.75 + 0.25));
            c.drawImage(im, -im.width / 2, -im.height / 2);
            c.restore();
            if (!it.book && (it.y > H + 200 || it.y < -400)) items.splice(i, 1);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      if (fxOn("sound")) stopSound = playSound();
      const anim = (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(kf, { fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
      const flip = (a: number) => `perspective(1500px) rotateY(${a}deg)`;
      // 1. 今の画面が、紙のようにめくれる
      anim(page?.root, [{ transform: flip(0) }, { transform: flip(-62), offset: 0.55 }, { transform: flip(-118) }], { duration: 640, easing: "cubic-bezier(.45,.05,.55,.95)" });
      anim(page?.shade, [{ opacity: 0 }, { opacity: 1 }], { duration: 640 });
      later(90, () => {
        for (let i = 0; i < 14; i++) addPage(false);
      });
      // 2. 本が開く：左のページに顔、右に技の名前
      later(520, () => {
        for (let i = 0; i < 12; i++) later(i * 45, addBook);
        anim(ray.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
      });
      later(700, () => {
        if (spread.current) spread.current.style.opacity = "1";
        anim(leafL.current, [{ transform: "rotateY(-92deg)" }, { transform: "rotateY(0deg)" }], { duration: 430 });
        anim(leafR.current, [{ transform: "rotateY(92deg)" }, { transform: "rotateY(0deg)" }], { duration: 430 });
        ray.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(24deg)" }], { duration: 3200, fill: "forwards" });
      });
      // 3. 本が閉じて光り、鍵を掲げた決めの絵
      later(1680, () => {
        anim(leafL.current, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-92deg)" }], { duration: 260, easing: "ease-in" });
        anim(leafR.current, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(92deg)" }], { duration: 260, easing: "ease-in" });
      });
      later(1900, () => {
        if (spread.current) spread.current.style.opacity = "0";
        flash.current?.animate([{ opacity: 0.92 }, { opacity: 0 }], { duration: 380, fill: "forwards" });
        amp = 0.9;
        anim(
          poseWrap.current,
          [
            { opacity: 0, transform: "translate(-50%,-44%) scale(.92)" },
            { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.22 },
            { opacity: 1, transform: "translate(-50%,-51.5%) scale(1.03)" },
          ],
          { duration: 1500 },
        );
        for (let i = 0; i < 10; i++) later(i * 70, addBook);
      });
      for (let i = 0; i < 10; i++) later(2100 + i * 100, () => (amp = Math.max(0.4, amp - 0.05)));
      // 4. 紙が舞い上がって画面をおおい、ページが閉じて戻る
      later(3050, () => {
        for (let i = 0; i < 46; i++) later(i * 12, () => addPage(true));
      });
      later(3320, () => {
        anim(page?.root, [{ transform: flip(-118) }, { transform: flip(0) }], { duration: 560, easing: "cubic-bezier(.3,.7,.4,1)" });
        anim(page?.shade, [{ opacity: 1 }, { opacity: 0 }], { duration: 560 });
      });
      later(3900, () => {
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

  // #root の外に置く（#root をめくるので、中に置くと一緒にめくれる）
  return createPortal(
    <>
      <div className="pages-fx">
        <div className="pages-bg" style={{ backgroundImage: `url(${dir}bg.webp)` }} />
        <div ref={ray} className="pages-ray" />
        <canvas ref={back} className="signature-fill" />
        <div ref={poseWrap} className="pages-pose">
          <canvas ref={pose} />
        </div>
        <canvas ref={front} className="signature-fill" />
        <div ref={spread} className="pages-spread">
          <div ref={leafL} className="pages-leaf left">
            <img ref={faceImg} alt="" />
          </div>
          <div ref={leafR} className="pages-leaf right">
            <div className="pages-name">万巻の開架</div>
          </div>
        </div>
        <div ref={flash} className="signature-flash" />
      </div>
      <div className="pages-catch" role="button" aria-label="飛ばす" onClick={onEnd}>
        <span className="signature-skip">押すと飛ばせます</span>
      </div>
    </>,
    document.body,
  );
}
