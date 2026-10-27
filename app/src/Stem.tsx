// 肢カードの上に出す問の文。肢で解く・聞き流し（T064）で共通
import { useState } from "react";

/**
 * 問のリード文（T049）。肢カードでは○×を聞くので、「誤っているものを組み合わせたものは」のような問の指示と食い違う。
 * 前提（「判例の立場に従って」など）が入っているので消さずに、2行までに畳んで小さく出す。押すと全文
 */
export default function Stem({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 50;
  return (
    <div className="card-stem">
      <p className={`stem small muted${long && !open ? " clamped" : ""}`}>{text}</p>
      {long && (
        <button className="link small" onClick={() => setOpen(!open)}>
          {open ? "問の文を畳む" : "問の文の全文"}
        </button>
      )}
    </div>
  );
}
