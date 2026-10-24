// 答え合わせの後の「よく似た肢（○×が逆）」（T050）。こちらの肢と相手の肢を並べ、違う部分に色を付ける
import type { Range, TwinView } from "./twins";

const mark = (v: boolean) => (v ? "○" : "×");

/** 本文の違う部分を <mark> で囲む */
export function Highlighted({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], k) => {
    if (s > at) parts.push(text.slice(at, s));
    parts.push(
      <mark key={k} className="twin-diff">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

export default function TwinsView({ twins }: { twins: TwinView[] }) {
  if (twins.length === 0) return null;
  return (
    <div className="twins">
      <div className="twins-title">よく似た肢（○×が逆）</div>
      {twins.map((t) => (
        <div key={t.otherId} className="twin-pair">
          <div className="twin-row">
            <span className={`twin-mark ${t.mine.truth ? "maru" : "batsu"}`}>{mark(t.mine.truth)}</span>
            <div>
              <div className="muted small">この肢（{t.mine.src}）</div>
              <Highlighted text={t.mine.text} ranges={t.mineDiff} />
            </div>
          </div>
          <div className="twin-row">
            <span className={`twin-mark ${t.other.truth ? "maru" : "batsu"}`}>{mark(t.other.truth)}</span>
            <div>
              <div className="muted small">よく似た肢（{t.other.src}）</div>
              <Highlighted text={t.other.text} ranges={t.otherDiff} />
            </div>
          </div>
        </div>
      ))}
      <p className="muted small">色を付けたところが違います。○×はどちらも出題時点の公式の解答によります（出題後の法改正で変わっていることがあります）。</p>
    </div>
  );
}
