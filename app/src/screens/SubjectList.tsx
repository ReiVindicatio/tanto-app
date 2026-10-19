// 科目の一覧（T025）：科目ごとのカード。タップで科目の画面へ
import type { CardRef, SubjectGroup } from "../data";
import { summarize } from "../history";
import { navigate } from "../router";
import { subjectColor } from "../subjectsMeta";
import { cardsOf, Progress } from "./common";

export default function SubjectList({ groups, cardIds }: { groups: SubjectGroup[]; cardIds: Map<string, CardRef[]> }) {
  return (
    <section>
      <h1>科目</h1>
      <div className="subject-cards">
        {groups.map((g) => {
          const ids = cardsOf(g.sets, cardIds).map((c) => c.id);
          const total = g.sets.reduce((n, s) => n + s.statement_cards, 0);
          const st = summarize(ids);
          const color = subjectColor(g.subject);
          return (
            <button
              key={g.subject}
              className="subject-card"
              style={{ borderLeftColor: color }}
              onClick={() => navigate({ name: "subject", subject: g.subject })}
            >
              <div className="subject-card-head">
                <span className="subject-name">{g.name}</span>
                <span className="muted small">{g.examName}</span>
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </div>
              <div className="muted small">
                {g.sets.length}年度・肢カード {total.toLocaleString()}枚・回答済み {st.answered.toLocaleString()}枚
              </div>
              <Progress value={total ? st.answered / total : 0} color={color} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
