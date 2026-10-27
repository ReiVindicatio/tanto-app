// 科目の一覧（T025）：科目ごとのカード。タップで科目の画面へ
import { TabRitsu } from "../Ritsu";
import { characterOn } from "../character";
import { EXAM_SHORT, type CardRef, type SubjectGroup } from "../data";
import { summarize } from "../history";
import { navigate } from "../router";
import { subjectColor } from "../subjectsMeta";
import { cardsOf, Progress } from "./common";

export default function SubjectList({ groups, cardIds }: { groups: SubjectGroup[]; cardIds: Map<string, CardRef[]> }) {
  return (
    <section>
      {/* 律（T065）：タブの縁に座っているだけ。押すとひとこと */}
      {characterOn() && <TabRitsu />}
      <h1>科目</h1>
      <div className="subject-cards">
        {groups.map((g) => {
          const ids = cardsOf(g.sets, cardIds).map((c) => c.id);
          const total = cardIds.size ? ids.length : g.sets.reduce((n, s) => n + s.statement_cards, 0); // 名寄せ後の枚数
          const years = g.exams
            .map((e) => `${g.exams.length > 1 ? EXAM_SHORT[e] : ""}${g.sets.filter((s) => s.exam.type === e).length}年度`)
            .join("・");
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
                <span className="muted small">{g.exams.map((e) => EXAM_SHORT[e]).join("・")}</span>
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </div>
              <div className="muted small">
                {years}・肢カード {total.toLocaleString()}枚・回答済み {st.answered.toLocaleString()}枚
              </div>
              <Progress value={total ? st.answered / total : 0} color={color} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
