// 課金衣装の動く背景。衣装を着ている間だけ、画面の一番奥に置く（styles.css の .world-backdrop）。視差効果を減らす設定なら止めた1コマにする
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasBackdrop, startBackdrop } from "./backdropScenes";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** いま流す背景の衣装（なければ空） */
function wanted(): string {
  const { costume, fx } = document.documentElement.dataset;
  return costume && hasBackdrop(costume) && (fx ?? "").split(" ").includes("backdrop") ? costume : "";
}

/** App の一番外に1つ置く。着替えは html の data-costume の変化で知る */
export function BackdropHost() {
  const [theme, setTheme] = useState(wanted);
  useEffect(() => {
    const look = () => setTheme(wanted());
    look();
    const watch = new MutationObserver(look);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-costume", "data-fx"] });
    return () => watch.disconnect();
  }, []);
  return theme ? <Backdrop key={theme} theme={theme} /> : null;
}

function Backdrop({ theme }: { theme: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => (cv.current ? startBackdrop(cv.current, theme, reduced()) : undefined), [theme]);
  return createPortal(
    <div className="world-backdrop" aria-hidden="true">
      <canvas ref={cv} />
    </div>,
    document.body,
  );
}
