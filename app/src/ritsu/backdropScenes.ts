// 課金衣装の動く背景を描く（docs/ritsu-special-ideas.md）。星詠み＝星のまたたきと流れ星、司書＝ほこりと紙、雪花＝雪とオーロラ、袴＝花びら、ロッカー＝雨とネオンの路地。
// 問題文の後ろを通るので、どれも淡く、数を絞る。端末の負担を抑えるため 30fps まで。画面が隠れている間は止まる
type Size = { w: number; h: number };
type Scene = (c: CanvasRenderingContext2D, s: Size, now: number, dt: number) => void;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** 画面の広さに合わせた粒の数 */
const countFor = ({ w, h }: Size, per: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, (w * h) / per)));

/** やわらかい光の粒。毎回グラデーションを作らないよう、最初に1枚描いておく */
function glow(color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return cv;
}

function stars(size: Size): Scene {
  const gold = glow("#ffe6a0");
  const white = glow("#ffffff");
  const dots = Array.from({ length: countFor(size, 6500, 45, 150) }, () => ({ x: Math.random(), y: Math.random(), r: rand(1.4, 3.6) * (Math.random() < 0.12 ? 1.7 : 1), p: rand(0, 6.28), v: rand(0.5, 1.5), gold: Math.random() < 0.25 }));
  let shot: { x: number; y: number; vx: number; vy: number; t: number; life: number } | null = null;
  let wait = rand(2, 6);
  return (c, { w, h }, now, dt) => {
    const t = now / 1000;
    for (const d of dots) {
      c.globalAlpha = 0.28 + 0.62 * Math.sin(t * d.v + d.p) ** 2;
      c.drawImage(d.gold ? gold : white, d.x * w - d.r, d.y * h - d.r, d.r * 2, d.r * 2);
    }
    c.globalAlpha = 1;
    wait -= dt;
    if (!shot && wait <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const sp = rand(420, 620);
      shot = { x: dir > 0 ? rand(-0.05, 0.5) * w : rand(0.5, 1.05) * w, y: rand(0.02, 0.4) * h, vx: dir * sp * 0.82, vy: sp * 0.57, t: 0, life: rand(0.7, 1.05) };
    }
    if (shot) {
      shot.t += dt;
      const k = shot.t / shot.life;
      if (k >= 1) {
        shot = null;
        wait = rand(7, 16);
      } else {
        const x = shot.x + shot.vx * shot.t;
        const y = shot.y + shot.vy * shot.t;
        const a = Math.sin(k * Math.PI);
        const tail = 0.22;
        const g = c.createLinearGradient(x, y, x - shot.vx * tail, y - shot.vy * tail);
        g.addColorStop(0, `rgba(255,244,210,${a})`);
        g.addColorStop(1, "rgba(255,226,150,0)");
        c.strokeStyle = g;
        c.lineWidth = 1.8;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - shot.vx * tail, y - shot.vy * tail);
        c.stroke();
        c.globalAlpha = a;
        c.drawImage(gold, x - 6, y - 6, 12, 12);
        c.globalAlpha = 1;
      }
    }
  };
}

function library(size: Size): Scene {
  const mote = glow("#ffd88f");
  const dust = Array.from({ length: countFor(size, 14000, 22, 60) }, () => ({ x: Math.random(), y: Math.random(), r: rand(1.5, 4.2), p: rand(0, 6.28), v: rand(5, 15), s: rand(0.3, 0.8) }));
  const sheets: { x: number; y: number; vy: number; p: number; spin: number; w: number }[] = [];
  let wait = rand(1, 4);
  return (c, { w, h }, now, dt) => {
    const t = now / 1000;
    for (const d of dust) {
      d.y -= (d.v * dt) / h;
      if (d.y < -0.02) d.y = 1.02;
      c.globalAlpha = 0.18 + 0.42 * Math.sin(t * d.s + d.p) ** 2;
      c.drawImage(mote, d.x * w + Math.sin(t * d.s + d.p) * 14 - d.r, d.y * h - d.r, d.r * 2, d.r * 2);
    }
    wait -= dt;
    if (wait <= 0 && sheets.length < 3) {
      sheets.push({ x: rand(0.05, 0.95) * w, y: -30, vy: rand(26, 40), p: rand(0, 6.28), spin: rand(0.8, 1.4), w: rand(13, 19) });
      wait = rand(6, 12);
    }
    for (let i = sheets.length - 1; i >= 0; i--) {
      const p = sheets[i];
      p.y += p.vy * dt;
      if (p.y > h + 30) {
        sheets.splice(i, 1);
        continue;
      }
      c.save();
      c.translate(p.x + Math.sin(t * 0.7 + p.p) * 30, p.y);
      c.rotate(Math.sin(t * 0.8 + p.p) * 0.7);
      c.scale(Math.cos(t * p.spin + p.p) * 0.75 + 0.25, 1);
      c.globalAlpha = 0.5;
      c.fillStyle = "#efe6d0";
      c.fillRect(-p.w / 2, -p.w * 0.65, p.w, p.w * 1.3);
      c.fillStyle = "#8d8294";
      for (let l = 0; l < 3; l++) c.fillRect(-p.w * 0.32, -p.w * 0.38 + l * p.w * 0.3, p.w * 0.64, 1);
      c.restore();
    }
    c.globalAlpha = 1;
  };
}

function snow(size: Size): Scene {
  const flake = glow("#ffffff");
  const flakes = Array.from({ length: countFor(size, 8500, 35, 110) }, () => {
    const depth = Math.random();
    return { x: Math.random(), y: Math.random(), r: 1.2 + depth * 3.4, v: 16 + depth * 34, a: 0.28 + depth * 0.5, p: rand(0, 6.28), s: rand(0.4, 1) };
  });
  // オーロラ：縦に長い光の帯を重ねる。帯の明るさと位置だけを、ゆっくり変える
  const bands = [
    { x: 0.24, w: 0.62, color: "98,235,205", v: 0.13, p: 0 },
    { x: 0.58, w: 0.55, color: "130,170,255", v: 0.1, p: 2.1 },
    { x: 0.82, w: 0.48, color: "190,140,255", v: 0.16, p: 4.2 },
  ].map((b) => {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const x = cv.getContext("2d")!;
    for (let i = 0; i < 128; i++) {
      const edge = Math.sin((i / 127) * Math.PI) ** 2;
      const g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, `rgba(${b.color},0)`);
      g.addColorStop(0.3 + 0.12 * Math.sin(i * 0.11 + b.p), `rgba(${b.color},${edge})`);
      g.addColorStop(1, `rgba(${b.color},0)`);
      x.fillStyle = g;
      x.fillRect(i, 0, 1, 128);
    }
    return { ...b, cv };
  });
  return (c, { w, h }, now, dt) => {
    const t = now / 1000;
    c.globalCompositeOperation = "lighter";
    for (const b of bands) {
      c.globalAlpha = 0.13 + 0.08 * Math.sin(t * b.v * 2 + b.p);
      const bw = b.w * w * (1 + 0.14 * Math.sin(t * b.v + b.p));
      c.drawImage(b.cv, (b.x + 0.07 * Math.sin(t * b.v + b.p * 2)) * w - bw / 2, -h * 0.04, bw, h * 0.52);
    }
    c.globalCompositeOperation = "source-over";
    for (const f of flakes) {
      f.y += (f.v * dt) / h;
      if (f.y > 1.02) {
        f.y = -0.02;
        f.x = Math.random();
      }
      c.globalAlpha = f.a;
      c.drawImage(flake, f.x * w + Math.sin(t * f.s + f.p) * 16 - f.r, f.y * h - f.r, f.r * 2, f.r * 2);
    }
    c.globalAlpha = 1;
  };
}

function petals(size: Size): Scene {
  const sprites = ["#f7b4c8", "#f49ab6", "#fbd0dc"].map((color) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 40;
    const x = cv.getContext("2d")!;
    x.translate(20, 20);
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0, 17);
    x.bezierCurveTo(-16, 8, -13, -11, -3, -16);
    x.lineTo(0, -11);
    x.lineTo(3, -16);
    x.bezierCurveTo(13, -11, 16, 8, 0, 17);
    x.fill();
    return cv;
  });
  const list = Array.from({ length: countFor(size, 19000, 14, 36) }, () => ({ x: Math.random(), y: Math.random(), r: rand(5.5, 11), v: rand(26, 54), p: rand(0, 6.28), s: rand(0.5, 1.1), spin: rand(0.8, 1.9), img: Math.floor(rand(0, 3)), a: rand(0.5, 0.85) }));
  return (c, { w, h }, now, dt) => {
    const t = now / 1000;
    for (const f of list) {
      f.y += (f.v * dt) / h;
      f.x += (9 * dt) / w;
      if (f.y > 1.03) {
        f.y = -0.03;
        f.x = Math.random();
      }
      if (f.x > 1.03) f.x = -0.03;
      c.save();
      c.translate(f.x * w + Math.sin(t * f.s + f.p) * 26, f.y * h);
      c.rotate(t * f.s * 0.8 + f.p);
      c.scale(Math.cos(t * f.spin + f.p) * 0.7 + 0.3, 1);
      c.globalAlpha = f.a;
      c.drawImage(sprites[f.img], -f.r, -f.r, f.r * 2, f.r * 2);
      c.restore();
    }
    c.globalAlpha = 1;
  };
}

/** 深紅のロッカー：雨上がりの夜の路地。絵の上に、雨の筋とネオンの稲妻のまたたきを重ねる。文字の後ろを通るので暗く保つ */
function alley(size: Size): Scene {
  const photo = new Image();
  photo.src = `${import.meta.env.BASE_URL}special/rock/bg.webp`;
  const rain = Array.from({ length: countFor(size, 9000, 30, 90) }, () => ({ x: Math.random(), y: Math.random(), len: rand(8, 22), v: rand(0.5, 0.9), a: rand(0.06, 0.2) }));
  // 両側の壁のネオン。左右の端に寄せて、問題文の後ろを避ける
  const neon = [
    { x: 0.05, y: 0.12, s: 0.13, p: rand(0, 6) },
    { x: 0.95, y: 0.2, s: 0.16, p: rand(0, 6) },
    { x: 0.04, y: 0.68, s: 0.11, p: rand(0, 6) },
    { x: 0.96, y: 0.74, s: 0.12, p: rand(0, 6) },
  ];
  const bolt = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    c.beginPath();
    for (const [i, [dx, dy]] of ([[0.2, -1], [-0.45, 0.1], [0, 0.1], [-0.25, 1], [0.5, -0.2], [0.08, -0.2], [0.2, -1]] as const).entries()) {
      if (i) c.lineTo(x + dx * s, y + dy * s);
      else c.moveTo(x + dx * s, y + dy * s);
    }
    c.closePath();
  };
  let surge = 0;
  let wait = rand(3, 8);
  return (c, { w, h }, now, dt) => {
    const t = now / 1000;
    c.fillStyle = "#0b0608";
    c.fillRect(0, 0, w, h);
    if (photo.complete && photo.naturalWidth) {
      const k = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
      c.globalAlpha = 0.42;
      c.drawImage(photo, (w - photo.naturalWidth * k) / 2, (h - photo.naturalHeight * k) / 2, photo.naturalWidth * k, photo.naturalHeight * k);
      c.globalAlpha = 1;
    }
    wait -= dt;
    if (wait <= 0) {
      surge = 1;
      wait = rand(6, 14);
    }
    surge = Math.max(0, surge - dt * 2.4);
    c.lineJoin = "round";
    for (const n of neon) {
      const buzz = Math.sin(t * 2.1 + n.p) > -0.86 ? 1 : 0.35; // ときどき、ネオンがちらつく
      const on = Math.min(1, (0.34 + 0.08 * Math.sin(t * 7 + n.p)) * buzz + surge * 0.5);
      const s = n.s * Math.min(w, h * 0.6);
      bolt(c, n.x * w, n.y * h, s);
      c.strokeStyle = `rgba(255, 60, 80, ${on * 0.55})`;
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = `rgba(255, 190, 196, ${on})`;
      c.lineWidth = 1.6;
      c.stroke();
    }
    c.strokeStyle = "#cfd8e6";
    c.lineWidth = 1;
    for (const d of rain) {
      d.y += d.v * dt;
      if (d.y > 1.05) {
        d.y = -0.05;
        d.x = Math.random();
      }
      c.globalAlpha = d.a;
      c.beginPath();
      c.moveTo(d.x * w, d.y * h);
      c.lineTo(d.x * w - d.len * 0.12, d.y * h + d.len);
      c.stroke();
    }
    c.globalAlpha = 1;
    // 足もとに映るネオン
    const floor = c.createLinearGradient(0, h * 0.82, 0, h);
    floor.addColorStop(0, "rgba(255, 50, 70, 0)");
    floor.addColorStop(1, `rgba(255, 50, 70, ${0.14 + surge * 0.14})`);
    c.fillStyle = floor;
    c.fillRect(0, h * 0.82, w, h * 0.18);
  };
}

const SCENES: Record<string, (size: Size) => Scene> = { hoshiyomi: stars, nocturne: library, yukihana: snow, hakama: petals, rock: alley };

/** 動く背景のある衣装か（歌姫は舞台照明がその役をする） */
export const hasBackdrop = (theme: string) => theme in SCENES;

/** キャンバスに背景を流す。still なら1コマだけ描いて止める。戻り値を呼ぶと止まる */
export function startBackdrop(cv: HTMLCanvasElement, theme: string, still = false): () => void {
  const c = cv.getContext("2d");
  const make = SCENES[theme];
  if (!c || !make) return () => {};
  const size: Size = { w: 0, h: 0 };
  const fit = () => {
    const r = Math.min(devicePixelRatio || 1, 2);
    size.w = cv.clientWidth || innerWidth;
    size.h = cv.clientHeight || innerHeight;
    cv.width = size.w * r;
    cv.height = size.h * r;
    c.setTransform(r, 0, 0, r, 0, 0);
  };
  fit();
  const scene = make(size);
  let raf = 0;
  let last = performance.now();
  const paint = (now: number, dt: number) => {
    c.clearRect(0, 0, size.w, size.h);
    scene(c, size, now, dt);
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 30) return; // 30fps まで
    paint(now, Math.min(0.05, (now - last) / 1000));
    last = now;
  };
  const onResize = () => {
    fit();
    if (still) paint(last, 0);
  };
  const onVisible = () => {
    cancelAnimationFrame(raf);
    if (document.hidden || still) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisible);
  if (still) paint(last, 0);
  else onVisible();
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
