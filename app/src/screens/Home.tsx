// ホーム（T025）：今日の成績と今日の復習。T022 で「今日の30問」に置き換える
import type { CardRef, SubjectGroup } from "../data";
import { currentState, localDate } from "../learning";
import { dueSummary } from "../srs";
import { navigate } from "../router";
import { startReview } from "../play";
import { cardsOf, Dot, poolOf } from "./common";

export default function Home({
  groups,
  cardIds,
  includePreReform,
}: {
  groups: SubjectGroup[];
  cardIds: Map<string, CardRef[]>;
  includePreReform: boolean;
}) {
  const today = currentState().daily.get(localDate(new Date()));
  return (
    <section>
      <div className="card today">
        <div className="muted small">今日の学習</div>
        {today ? (
          <div className="today-stats">
            <span>
              <strong className="big">{today.answered}</strong> 肢
            </span>
            <span>
              正答率 <strong className="big">{Math.round((today.correct / today.answered) * 100)}</strong>%
            </span>
          </div>
        ) : (
          <div>まだ解いていません。下の「今日の復習」から始めましょう。</div>
        )}
      </div>

      <h2>今日の復習</h2>
      <p className="muted small">忘れかけた肢とまちがえた肢を優先し、新しい肢を科目ごとに1日20枚まで混ぜて出します。</p>
      <div className="list">
        {groups.map((g) => {
          const pool = poolOf(g, includePreReform);
          const srs = dueSummary(cardsOf(pool, cardIds));
          return (
            <div className="list-row review-row" key={g.subject}>
              <Dot subject={g.subject} />
              <div className="grow">
                <div className="row-title">{g.name}</div>
                <div className="muted small">
                  期限 {srs.due}枚・新規の残り {srs.newLeft}枚
                </div>
              </div>
              <button className="small" disabled={pool.length === 0} onClick={() => startReview(pool, `${g.name} 今日の復習`)}>
                はじめる
              </button>
            </div>
          );
        })}
      </div>

      <button className="secondary wide" onClick={() => navigate({ name: "subjects" })}>
        科目・年度を選んで解く
      </button>
    </section>
  );
}
