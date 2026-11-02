// 風を受ける座り絵（星詠み）。絵が読めない・WebGL がないときは onFail を呼び、ふつうの座り絵に戻す
import { useEffect, useRef } from "react";
import { charDir } from "../character";
import { loadImage, makeWarp, makeWind, type Warp } from "./cape";

/** 風の強さ。ユーザーが試作で「強い」を選んだ */
const STRENGTH = 1.7;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CapeFigure({ theme, face, onFail }: { theme: string; face: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const warp = useRef<Warp | null>(null);
  const faceRef = useRef(face);
  const images = useRef(new Map<string, HTMLImageElement>());
  const dir = charDir(theme);

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
        const [img, map] = await Promise.all([image(face), loadImage(`${dir}wind-map.png`)]);
        if (stop || !canvas.current) return;
        warp.current = makeWarp(canvas.current, img, map, [1, 0]);
        if (!warp.current) throw new Error("webgl");
        const tick = (now: number) => {
          if (stop) return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const { gust, phi } = wind.step(dt, STRENGTH);
          if (faceRef.current === "smile" && !blinking && now > blinkAt && !reduced()) {
            blinking = true;
            void image("blink").then((b) => {
              warp.current?.setImage(b);
              window.setTimeout(() => {
                void image(faceRef.current).then((s) => warp.current?.setImage(s));
                blinking = false;
                blinkAt = performance.now() + 2500 + Math.random() * 3500;
              }, 130);
            });
          }
          warp.current?.draw(gust, phi, reduced() ? 0 : STRENGTH);
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
    faceRef.current = face;
    void image(face)
      .then((i) => warp.current?.setImage(i))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);

  return <canvas ref={canvas} className="cape-figure" aria-hidden="true" />;
}
