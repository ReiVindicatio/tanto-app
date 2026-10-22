// ★（あとで見直す）のボタン（T026）
import { useEffect, useState } from "react";
import { isBookmarked, onBookmarksChange, toggleBookmark } from "./bookmarks";

/** compact：元の問題の肢の横に置く小さいボタン（★／☆だけ） */
export default function StarButton({ id, compact = false }: { id: string; compact?: boolean }) {
  const [, setVersion] = useState(0);
  useEffect(() => onBookmarksChange(() => setVersion((v) => v + 1)), []);
  const on = isBookmarked(id);
  return (
    <button
      className={`link star${on ? " on" : ""}${compact ? " compact" : ""}`}
      aria-pressed={on}
      aria-label={on ? "★を外す" : "あとで見直す（★を付ける）"}
      title={on ? "★を外す" : "あとで見直す"}
      onClick={() => toggleBookmark(id)}
    >
      {compact ? (on ? "★" : "☆") : on ? "★ 見直す肢に入れた" : "☆ あとで見直す"}
    </button>
  );
}
