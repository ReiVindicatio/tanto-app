// 画面の上の帯の小さな印「🔥連続日数 Lv.N」（T029）。押すと律のページ（T065。キャラクターを出さないときはマイページ）
import { navigate } from "./router";
import { progressNow } from "./progress";
import { characterOn } from "./character";

export default function StreakChip() {
  const p = progressNow();
  return (
    <button
      className="link streak-chip"
      aria-label={`連続 ${p.streak} 日・レベル ${p.level}・今日 ${p.today} / ${p.goal} 肢`}
      onClick={() => navigate({ name: characterOn() ? "ritsu" : "me" })}
    >
      🔥{p.streak} <span className="muted">Lv.</span>
      {p.level}
    </button>
  );
}
