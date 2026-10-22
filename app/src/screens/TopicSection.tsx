// 科目の画面の「分野ごと」（T016）：分野ごとの前回正解の割合と、分野・苦手な分野だけを解くボタン
import { useEffect, useState } from "react";
import type { SetInfo } from "../types";
import { startChosen } from "../play";
import { uniqueCards } from "../data";
import { byWeakness, isWeak, loadTopics, MIN_ANSWERED, topicStats, WEAK_RATE, type Topic } from "../topics";

const pct = (r: number) => `${Math.round(r * 100)}%`;

// 解いて戻ってきたときに、開いた状態と並び順を保つ（画面を作り直しても消えないように、ここに持つ）
const opened = new Set<string>();
const weakOrder = new Set<string>();

export default function TopicSection({ subject, name, pool }: { subject: string; name: string; pool: SetInfo[] }) {
  const [open, setOpenState] = useState(opened.has(subject));
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weakFirst, setWeakFirstState] = useState(weakOrder.has(subject));
  const setOpen = (v: boolean) => {
    if (v) opened.add(subject);
    else opened.delete(subject);
    setOpenState(v);
  };
  const setWeakFirst = (v: boolean) => {
    if (v) weakOrder.add(subject);
    else weakOrder.delete(subject);
    setWeakFirstState(v);
  };
  const setKey = pool.map((s) => s.id).join(" ");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTopics(null);
    loadTopics(subject, new Set(pool.map((s) => s.id)))
      .then((t) => alive && setTopics(t))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject, setKey]);

  // 回答のたびに描き直されるので、その都度数える（1科目で千数百枚）
  const stats = new Map((topics ?? []).map((t) => [t.label, topicStats(t)]));
  const weak = (topics ?? []).filter((t) => isWeak(stats.get(t.label)!));
  const weakCards = uniqueCards(weak.flatMap((t) => t.cards));
  const shown = topics ? (weakFirst ? byWeakness(topics, stats) : topics) : [];

  return (
    <details className="set topics" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="set-title">分野ごと（苦手な分野を解く）</summary>
      {error && <p className="error small">分野を読めませんでした：{error}</p>}
      {open && !topics && !error && <p className="muted small">読み込み中…</p>}
      {topics && (
        <>
          <p className="muted small">
            分野は、解説が引いている条文が法令の目次のどの編・章にあるかで分けています。前回正解の割合が{pct(WEAK_RATE)}未満（回答済み{MIN_ANSWERED}枚以上）の分野を「苦手」とします。
          </p>
          <div className="row">
            <button
              disabled={weakCards.length === 0}
              onClick={() => startChosen(pool, weakCards, `${name} 苦手な分野`)}
            >
              苦手な分野をまとめて解く（{weak.length}分野・{weakCards.length}枚）
            </button>
          </div>
          <div className="segmented" role="group" aria-label="分野の並び">
            <button className={!weakFirst ? "chosen" : ""} aria-pressed={!weakFirst} onClick={() => setWeakFirst(false)}>
              目次の順
            </button>
            <button className={weakFirst ? "chosen" : ""} aria-pressed={weakFirst} onClick={() => setWeakFirst(true)}>
              苦手な順
            </button>
          </div>
          <ul className="topic-list">
            {shown.map((t) => {
              const s = stats.get(t.label)!;
              return (
                <li key={t.label} className={`topic${isWeak(s) ? " weak" : ""}`}>
                  <div className="grow">
                    <div className="topic-label">{t.label}</div>
                    <div className="muted small">
                      {s.cards}枚・回答済み {s.answered}枚
                      {s.rate !== null && `・前回正解 ${pct(s.rate)}`}
                      {isWeak(s) && "（苦手）"}
                    </div>
                  </div>
                  <button className="secondary small" onClick={() => startChosen(pool, t.cards, `${name} ${t.label}`)}>
                    解く
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </details>
  );
}
