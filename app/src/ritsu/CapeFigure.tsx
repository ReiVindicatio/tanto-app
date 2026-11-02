// 風を受ける座り絵（星詠み）。絵が読めない・WebGL がないときは onFail を呼び、ふつうの座り絵に戻す
import { useEffect, useRef } from "react";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";
import { kitOf } from "./kits";

/** 口パクの絵がある表情 */
const TALK_FACES = ["normal", "smile", "think", "happy", "sad"];

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CapeFigure({ theme, face, mouth = false, onFail }: { theme: string; face: string; mouth?: boolean; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const warp = useRef<Warp | null>(null);
  const shown = mouth && TALK_FACES.includes(face) ? `${face}-talk` : face;
  const faceRef = useRef(shown);
  const images = useRef(new Map<string, HTMLImageElement>());
  const dir = charDir(theme);
  const live = kitOf(theme).live;
  const strength = live?.strength ?? 1;

  const image = async (name: string) => {
    const known = images.current.get(name);
    if (known) return known;
    const img = await loadImage(`${dir}wind-${name}.webp`);
    images.current.set(name, img);
    return img;
  };

  useEffect(() => {
    let raf = 0;
    let stop = false;
    let last = performance.now();
    let blinkAt = last + 3000;
    let blinking = false;
    const wind = makeWind();
    void (async () => {
      try {
        const [img, map] = await Promise.all([image(shown), loadImage(`${dir}wind-map.png`)]);
        if (stop || !canvas.current) return;
        warp.current = makeWarp(canvas.current, img, map, live?.dir ?? [1, 0]);
        if (!warp.current) throw new Error("webgl");
        const tick = (now: number) => {
          if (stop) return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const { gust, phi } = wind.step(dt, Math.max(0.5, strength));
          if (faceRef.current === "smile" && !blinking && now > blinkAt && !reduced()) {
            blinking = true;
            void image("blink")
              .then((b) => {
                warp.current?.setImage(b);
                window.setTimeout(() => {
                  void image(faceRef.current).then((s) => warp.current?.setImage(s));
                  blinking = false;
                  blinkAt = performance.now() + 2500 + Math.random() * 3500;
                }, 130);
              })
              .catch(() => {
                blinkAt = Infinity; // まばたきの絵がなければ、まばたきしない
              });
          }
          warp.current?.draw(gust, phi, reduced() ? 0 : strength);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stop) onFail();
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      warp.current?.dispose();
      warp.current = null;
    };
    // 表情は下の別の effect で替える（作り直すと WebGL を毎回作ることになる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  useEffect(() => {
    faceRef.current = shown;
    void image(shown)
      .then((i) => warp.current?.setImage(i))
      .catch(() => undefined);
    // 声が出たときに待たないよう、この表情の口パクも先に読む
    if (TALK_FACES.includes(face)) void image(`${face}-talk`).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return <canvas ref={canvas} className={`cape-figure fig-${live?.kind ?? "cape"}${live?.flip ? " flip" : ""}`} aria-hidden="true" />;
}
