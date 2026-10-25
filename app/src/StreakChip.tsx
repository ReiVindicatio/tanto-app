// 画面の上の帯の小さな印「🔥連続日数 Lv.N」（T029）。押すとマイページ（連続日数・レベル・今日の目標）
import { navigate } from "./router";
import { progressNow } from "./progress";

export default function StreakChip() {
  const p = progressNow();
  return (
    <button
      className="link streak-chip"
      aria-label={`連続 ${p.streak} 日・レベル ${p.level}・今日 ${p.today} / ${p.goal} 肢`}
      onClick={() => navigate({ name: "me" })}
    >
      🔥{p.streak} <span className="muted">Lv.</span>
      {p.level}
    </button>
  );
}
