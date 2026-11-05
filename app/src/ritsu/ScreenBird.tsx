// 袴の小鳥：律のそばを離れて、画面の上に住む。枠のふち・○×のボタン・律の頭にとまり、ときどき飛んで移る。答えると、押したボタンの上で反応する。文字の上にはとまらない
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { charDir } from "../character";

const SIZE = 54;
type Frame = "stand" | "up" | "down" | "tilt" | "happy";
const FRAMES: Frame[] = ["stand", "up", "down", "tilt", "happy"];
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 律の絵の中の、足元の位置（絵の幅・高さに対する割合） */
const HEAD: [number, number] = [0.464, 0.121];
const BRANCH: [number, number] = [0.283, 0.721];

/** 画面の上にある場所だけを返す。見えないものや、その画面にないものは null */
function edgeOf(selector: string, at: number, index = 0): [number, number] | null {
  const el = document.querySelectorAll(selector)[index];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 60 || r.top < 56 || r.top > innerHeight - 40) return null;
  return [r.left + r.width * at, r.top];
}

function onFigure(at: [number, number]): [number, number] | null {
  const r = document.querySelector(".perch.branch .cape-figure")?.getBoundingClientRect();
  return r ? [r.left + r.width * at[0], r.top + r.height * at[1]] : null;
}

const SPOTS: Record<string, () => [number, number] | null> = {
  head: () => onFigure(HEAD),
  branch: () => onFigure(BRANCH),
  cardLeft: () => edgeOf(".swipe-card, main .card", 0.14),
  cardRight: () => edgeOf(".swipe-card, main .card", 0.84),
  markNo: () => edgeOf("button.mark", 0.5, 0),
  markYes: () => edgeOf("button.mark", 0.5, 1),
  next: () => edgeOf(".actionbar button", 0.5),
};

type Listener = (correct: boolean, yes: boolean) => void;
const listeners = new Set<Listener>();

/** 答えたとき（肢の画面から呼ぶ）。小鳥がいなければ何もしない */
export function birdReact(correct: boolean, yes: boolean): void {
  listeners.forEach((f) => f(correct, yes));
}

/** App の一番外に1つ置く。答えると律の絵は作り直されるので、小鳥は律の中に置かない（反応の途中で消えた）。枝に座る律が画面にいる間だけ出す */
export function ScreenBirdHost({ theme }: { theme: string }) {
  const [here, setHere] = useState(false);
  useEffect(() => {
    let gone = 0;
    const clock = window.setInterval(() => {
      if (document.querySelector(".perch.branch")) {
        gone = 0;
        setHere(true);
      } else if (++gone >= 3) {
        setHere(false); // 絵の差し替えの間は残す
      }
    }, 300);
    return () => window.clearInterval(clock);
  }, []);
  return here ? <ScreenBird theme={theme} /> : null;
}

function ScreenBird({ theme }: { theme: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const images = useRef<Partial<Record<Frame, HTMLImageElement | null>>>({});
  const dir = charDir(theme);

  useEffect(() => {
    const calm = reduced();
    let at = "branch";
    let fixedSpot: [number, number] | null = null;
    let pos: [number, number] = SPOTS.branch() ?? [innerWidth - 120, innerHeight - 120];
    let facing = 1;
    let flying = false;
    let busy = false;
    let raf = 0;
    let wanderTimer = 0;
    let fidgetTimer = 0;
    const show = (f: Frame) => {
      for (const k of FRAMES) {
        const i = images.current[k];
        if (i) i.style.visibility = k === f ? "visible" : "hidden";
      }
    };
    const place = (x: number, y: number) => {
      if (button.current) button.current.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE}px) scaleX(${facing})`;
    };
    const jump = (h: number, d: number) => button.current?.animate([{ translate: "0 0" }, { translate: `0 -${h}px` }, { translate: "0 0" }], { duration: d, easing: "ease-out" });
    const trail = (x: number, y: number) => {
      const p = document.createElement("i");
      p.className = "bird-petal";
      p.style.left = `${x + (Math.random() - 0.5) * 14}px`;
      p.style.top = `${y + (Math.random() - 0.5) * 10}px`;
      document.body.appendChild(p);
      const a = p.animate(
        [
          { opacity: 0.95, transform: "translateY(0) rotate(0)" },
          { opacity: 0, transform: `translate(${(Math.random() - 0.5) * 24}px, ${18 + Math.random() * 26}px) rotate(${Math.random() * 200}deg)` },
        ],
        { duration: 900 + Math.random() * 700, easing: "ease-out" },
      );
      a.onfinish = () => p.remove();
      a.oncancel = () => p.remove();
    };
    const schedule = () => {
      window.clearTimeout(wanderTimer);
      wanderTimer = window.setTimeout(wander, 11000 + Math.random() * 8000);
    };
    const fly = (to: string | [number, number], after?: () => void) => {
      cancelAnimationFrame(raf);
      window.clearTimeout(wanderTimer);
      const end = typeof to === "string" ? SPOTS[to]?.() : to;
      if (!end) {
        schedule();
        return;
      }
      if (typeof to === "string") {
        at = to;
        fixedSpot = null;
      } else {
        fixedSpot = to;
      }
      if (calm) {
        pos = end;
        place(end[0], end[1]);
        show("stand");
        after?.();
        schedule();
        return;
      }
      flying = true;
      const from: [number, number] = [pos[0], pos[1]];
      facing = end[0] > from[0] ? -1 : 1; // 絵は左向き
      const d = Math.hypot(end[0] - from[0], end[1] - from[1]);
      const dur = Math.max(450, Math.min(1100, d * 3.2));
      const lift = Math.min(90, 40 + d * 0.22);
      const t0 = performance.now();
      const step = (n: number) => {
        const u = Math.min(1, (n - t0) / dur);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const x = from[0] + (end[0] - from[0]) * e;
        const y = from[1] + (end[1] - from[1]) * e - Math.sin(Math.PI * e) * lift + Math.sin(n / 70) * 1.6;
        show(Math.floor(n / 70) % 2 ? "up" : "down");
        pos = [x, y];
        place(x, y);
        if (Math.random() < 0.32) trail(x, y - SIZE * 0.45);
        if (u < 1) {
          raf = requestAnimationFrame(step);
        } else {
          flying = false;
          pos = [end[0], end[1]];
          place(pos[0], pos[1]);
          show("stand");
          button.current?.animate([{ translate: "0 0" }, { translate: "0 3px" }, { translate: "0 0" }], { duration: 180, easing: "ease-out" });
          after?.();
          schedule();
        }
      };
      raf = requestAnimationFrame(step);
    };
    function wander() {
      const can = Object.keys(SPOTS).filter((k) => k !== at && SPOTS[k]());
      if (can.length) fly(can[Math.floor(Math.random() * can.length)]);
      else schedule();
    }
    const fidget = () => {
      if (!flying && !busy) {
        if (Math.random() < 0.5) {
          show("tilt");
          window.setTimeout(() => {
            if (!flying && !busy) show("stand");
          }, 700);
        } else {
          jump(7, 260);
        }
      }
      fidgetTimer = window.setTimeout(fidget, 2600 + Math.random() * 3400);
    };
    const react: Listener = (correct, yes) => {
      busy = true;
      // 答えると画面が変わってボタンがなくなるので、今の位置を覚えて飛ぶ
      const spot = edgeOf("button.mark", 0.5, yes ? 1 : 0);
      const done = () => {
        show(correct ? "happy" : "tilt");
        if (correct && !calm) {
          for (let k = 0; k < 3; k++) window.setTimeout(() => jump(9, 240), k * 280);
          for (let k = 0; k < 8; k++) trail(pos[0], pos[1] - SIZE * 0.5);
        }
        window.setTimeout(() => {
          busy = false;
          if (!flying) show("stand");
        }, 1700);
      };
      if (spot) fly(spot, done);
      else done();
    };
    listeners.add(react);
    // スクロールや画面の切り替えのあとも、とまっている物についていく。全画面の技の間は隠す
    const follow = window.setInterval(() => {
      const hide = !!document.querySelector(".pages-catch, .signature, .curtain-fx, .bolt-fx");
      if (button.current) button.current.style.visibility = hide ? "hidden" : "visible";
      if (flying) return;
      if (fixedSpot) {
        if (!busy) fly("branch");
        return;
      }
      const p = SPOTS[at]?.();
      if (!p) fly("branch");
      else if (Math.hypot(p[0] - pos[0], p[1] - pos[1]) > 2) {
        pos = p;
        place(p[0], p[1]);
      }
    }, 250);
    show("stand");
    place(pos[0], pos[1]);
    if (!calm) {
      wanderTimer = window.setTimeout(wander, 2500);
      fidgetTimer = window.setTimeout(fidget, 2000);
    }
    const bird = button.current;
    const goHome = (e: Event) => {
      e.stopPropagation();
      fly("branch");
    };
    bird?.addEventListener("click", goHome);
    return () => {
      listeners.delete(react);
      cancelAnimationFrame(raf);
      window.clearTimeout(wanderTimer);
      window.clearTimeout(fidgetTimer);
      window.clearInterval(follow);
      bird?.removeEventListener("click", goHome);
    };
  }, []);

  return createPortal(
    <button ref={button} className="screen-bird" aria-label="小鳥">
      {FRAMES.map((f) => (
        <img
          key={f}
          ref={(el) => {
            images.current[f] = el;
          }}
          src={`${dir}bird-${f}.webp`}
          alt=""
        />
      ))}
    </button>,
    document.body,
  );
}
