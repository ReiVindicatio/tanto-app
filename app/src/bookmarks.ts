// ブックマーク（★：あとで見直す。T026）。
// 回答ログと同じく、付けた／外したの操作を追記していき（消さない・書き換えない）、肢ごとに一番新しい操作を正とする。
// 2台で別々に付け外ししても、同期すれば最後の操作に合わせて同じ結果になる。
// ★は出典の肢 ID で記録し、判定はカード ID で行う（名寄せ：決定018。司法の肢に★を付けると、同じ予備の肢にも★が付いて見える）
import { cardIdOf } from "./learning";
import { newAnswerId } from "./store";

/** ★の操作1件。on：true＝付けた、false＝外した */
export type BookmarkEvent = { id: string; s: string; on: boolean; at: string };

const KEY = "tanto.bookmarks.v1";

/** 端末の★の操作（localStorage） */
export class LocalBookmarkStore {
  constructor(private readonly storage: Storage = localStorage) {}

  load(): BookmarkEvent[] {
    try {
      return JSON.parse(this.storage.getItem(KEY) ?? "[]") as BookmarkEvent[];
    } catch (e) {
      console.error("★の記録を読めませんでした", e);
      return [];
    }
  }

  /** 追記する。同じ操作 ID は二重にしない（同期で受け取った分など） */
  appendMany(events: BookmarkEvent[]): BookmarkEvent[] {
    const log = this.load();
    const have = new Set(log.map((e) => e.id));
    const news = events.filter((e) => !have.has(e.id) && (have.add(e.id), true));
    if (news.length > 0) this.storage.setItem(KEY, JSON.stringify([...log, ...news]));
    return news;
  }

  clear(): void {
    this.storage.removeItem(KEY);
  }
}

/** 操作の一覧から、★の付いたカード ID の集合を作る（カードごとに一番新しい操作。日時が同じなら操作 ID の大きいほう） */
export function markedCards(events: BookmarkEvent[], cardOf: (id: string) => string = cardIdOf): Set<string> {
  const latest = new Map<string, BookmarkEvent>();
  for (const e of events) {
    const k = cardOf(e.s);
    const prev = latest.get(k);
    if (!prev || e.at > prev.at || (e.at === prev.at && e.id > prev.id)) latest.set(k, e);
  }
  return new Set([...latest].filter(([, e]) => e.on).map(([k]) => k));
}

// ---- アプリ全体で1つの状態 ----

/** ★の保存先（SyncedStore が実装する：端末に保存し、ログインしていれば同期する） */
export interface BookmarkSink {
  loadBookmarks(): BookmarkEvent[];
  appendBookmark(e: BookmarkEvent): Promise<void>;
}

let sink: BookmarkSink | null = null;
let events: BookmarkEvent[] = [];
let cache: Set<string> | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  cache = null;
  listeners.forEach((cb) => cb());
}

export function initBookmarks(s: BookmarkSink): void {
  sink = s;
  events = s.loadBookmarks();
  cache = null;
}

/** 保存先から読み直す（同期で受け取ったとき・ログアウトのとき・名寄せの対応表が変わったとき） */
export function reloadBookmarks(): void {
  if (sink) events = sink.loadBookmarks();
  changed();
}

/** ★の付いたカード ID の集合 */
export function bookmarkedCards(): Set<string> {
  cache ??= markedCards(events);
  return cache;
}

export function isBookmarked(statementId: string): boolean {
  return bookmarkedCards().has(cardIdOf(statementId));
}

/** ★を付ける／外す。メモリ上の状態をすぐ変え、保存先へ追記する */
export function toggleBookmark(statementId: string, now = new Date()): void {
  const e: BookmarkEvent = { id: newAnswerId(), s: statementId, on: !isBookmarked(statementId), at: now.toISOString() };
  events = [...events, e];
  changed();
  sink?.appendBookmark(e).catch((err) => console.error("★を保存できませんでした", err));
}

export function onBookmarksChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
