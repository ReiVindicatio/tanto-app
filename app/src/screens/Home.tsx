// ホーム（T025・T022）：今日の○問・科目へのリンク（今日の成績は T034 でやめた）
import { useState } from "react";
import type { CardRef, SubjectGroup } from "../data";
import { navigate } from "../router";
import { startDaily } from "../play";
import { buildDaily, DAILY_SIZES, describeCounts, getDailyPrefs, setDailyPrefs, type DailyPrefs } from "../daily";
import { cardsOf, poolOf } from "./common";

function QuickStart({
  groups,
  cardIds,
  includePreReform,
}: {
  groups: SubjectGroup[];
  cardIds: Map<string, CardRef[]>;
  includePreReform: boolean;
}) {
  const [prefs, setPrefs] = useState<DailyPrefs>(getDailyPrefs());
  const update = (p: DailyPrefs) => {
    setPrefs(p);
    setDailyPrefs(p);
  };
  const scoped = groups.filter((g) => g.subject === prefs.subject);
  const target = scoped.length > 0 ? scoped : groups; // 保存した科目がなくなっていたら全科目
  const infos = target.flatMap((g) => poolOf(g, includePreReform));
  // 中身の見込み（はじめるときに同じ順で選び、並びだけシャッフルする）
  const preview = buildDaily(cardsOf(infos, cardIds), prefs.size, new Date(), false);
  const scopeName = scoped.length > 0 ? scoped[0].name : "全科目";

  return (
    <div className="card hero">
      <div className="hero-title">
        今日の<span className="hero-count">{prefs.size}</span>問
      </div>
      <div className="muted small hero-breakdown">
        {scopeName}：{cardIds.size === 0 ? "読み込み中…" : describeCounts(preview.counts) || "出題できる肢がありません"}
      </div>
      <div className="segmented" role="group" aria-label="問題数">
        {DAILY_SIZES.map((n) => (
          <button
            key={n}
            className={prefs.size === n ? "chosen" : ""}
            aria-pressed={prefs.size === n}
            onClick={() => update({ ...prefs, size: n })}
          >
            {n}問
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="範囲">
        <button
          className={scoped.length === 0 ? "chosen" : ""}
          aria-pressed={scoped.length === 0}
          onClick={() => update({ ...prefs, subject: null })}
        >
          全科目
        </button>
        {groups.map((g) => (
          <button
            key={g.subject}
            className={prefs.subject === g.subject ? "chosen" : ""}
            aria-pressed={prefs.subject === g.subject}
            onClick={() => update({ ...prefs, subject: g.subject })}
          >
            {g.name}
          </button>
        ))}
      </div>
      <button
        className="wide start"
        disabled={preview.cards.length === 0}
        onClick={() => startDaily(infos, prefs.size, `今日の${prefs.size}問`)}
      >
        はじめる
      </button>
      <p className="muted small hero-note">忘れかけた肢・まちがえた肢を先に、残りを新しい肢で埋めて出します。</p>
    </div>
  );
}

export default function Home({
  groups,
  cardIds,
  includePreReform,
}: {
  groups: SubjectGroup[];
  cardIds: Map<string, CardRef[]>;
  includePreReform: boolean;
}) {
  return (
    <section>
      <QuickStart groups={groups} cardIds={cardIds} includePreReform={includePreReform} />

      <button className="secondary wide" onClick={() => navigate({ name: "subjects" })}>
        科目・年度を選んで解く
      </button>
    </section>
  );
}
