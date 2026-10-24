// ホーム（T025・T022）：今日の○問・科目へのリンク（今日の成績は T034 でやめた）
import { useState } from "react";
import type { CardRef, SubjectGroup } from "../data";
import { navigate } from "../router";
import { startChosen, startDaily, startEndless } from "../play";
import { bookmarkedCards } from "../bookmarks";
import { cardIdOf } from "../learning";
import { buildDaily, DAILY_SIZES, describeCounts, ENDLESS, ENDLESS_BATCH, getDailyPrefs, setDailyPrefs, type DailyPrefs } from "../daily";
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
  const endless = prefs.size === ENDLESS;
  const pool = cardsOf(infos, cardIds);
  // 中身の見込み（エンドレスは20問ずつ選ぶので、最初のひとまとまりの見込み）
  const preview = buildDaily(pool, endless ? ENDLESS_BATCH : prefs.size, new Date(), false);
  const scopeName = scoped.length > 0 ? scoped[0].name : "全科目";

  return (
    <div className="card hero">
      <div className="hero-title">
        {endless ? (
          <span className="hero-count">エンドレス</span>
        ) : (
          <>
            今日の<span className="hero-count">{prefs.size}</span>問
          </>
        )}
      </div>
      <div className="muted small hero-breakdown">
        {scopeName}：
        {cardIds.size === 0
          ? "読み込み中…"
          : preview.cards.length === 0
            ? "出題できる肢がありません"
            : endless
              ? `肢 ${pool.length.toLocaleString()}枚から、終わるまで続けて出します`
              : describeCounts(preview.counts)}
      </div>
      <div className="segmented" role="group" aria-label="問題数">
        {DAILY_SIZES.map((n) => (
          <button
            key={n}
            className={prefs.size === n ? "chosen" : ""}
            aria-pressed={prefs.size === n}
            onClick={() => update({ ...prefs, size: n })}
          >
            {n === ENDLESS ? "エンドレス" : `${n}問`}
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
        onClick={() => (endless ? startEndless(infos, "エンドレス") : startDaily(infos, prefs.size, `今日の${prefs.size}問`))}
      >
        はじめる
      </button>
      <p className="muted small hero-note">
        忘れかけた肢・まちがえた肢を先に、残りを新しい肢で埋めて出します。
        {endless && "エンドレスは、右上の「終わる」を押すまで続きます。"}
      </p>
    </div>
  );
}

/** ★を付けた肢を解く（T026）。民法の改正前の年度も含める（自分で選んだ肢なので） */
function BookmarkStart({ groups, cardIds }: { groups: SubjectGroup[]; cardIds: Map<string, CardRef[]> }) {
  const marked = bookmarkedCards();
  if (marked.size === 0 || cardIds.size === 0) return null;
  const infos = groups.flatMap((g) => g.sets);
  const chosen = cardsOf(infos, cardIds).filter((c) => marked.has(cardIdOf(c.id)));
  if (chosen.length === 0) return null;
  return (
    <button className="secondary wide" onClick={() => startChosen(infos, chosen, "★を付けた肢")}>
      ★を付けた肢を解く（{chosen.length}枚）
    </button>
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

      <BookmarkStart groups={groups} cardIds={cardIds} />

      <button className="secondary wide" onClick={() => navigate({ name: "subjects" })}>
        科目・年度を選んで解く
      </button>
    </section>
  );
}
