// 学習記録の保存先（T020）。保存するのは回答ログだけ。
// 保存先を差し替えるときは RecordStore の実装を足す（T003 で Supabase 用を足す予定）。
// 画面や、集計・FSRS の計算（learning.ts）は保存先を知らない。

/** 回答1回分。追記だけで、消さない・書き換えない */
export type Answer = {
  id: string; // 回答ごとの一意な ID（同期のときの重複除去に使う）
  s: string; // 肢 ID
  ok: boolean; // 正解したか
  at: string; // 回答した日時（ISO）
};

export interface RecordStore {
  /** 回答ログを全部読む */
  load(): Promise<Answer[]>;
  /** 1件追記する */
  append(answer: Answer): Promise<void>;
}

const LOG_KEY = "tanto.log.v1";

// T020 より前の形式（肢ごとの集計・FSRS の状態・新規の数）。変換後は tanto.legacy.* に名前を変えて残す
const LEGACY_KEYS = ["tanto.history.v1", "tanto.srs.v1", "tanto.srs.new.v2"];

export function newAnswerId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 旧形式の集計を、肢ごとに1件の回答ログに変換する（最後の正誤と日時を使う）。
 * 回答回数と FSRS の細かい状態は戻せない（設計どおり）。
 */
export function convertLegacyHistory(history: { [id: string]: { last: boolean; at: string } }): Answer[] {
  return Object.entries(history)
    .filter(([, r]) => r && typeof r.at === "string" && r.at)
    .map(([s, r]) => ({ id: newAnswerId(), s, ok: Boolean(r.last), at: r.at }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export class LocalStorageStore implements RecordStore {
  constructor(private readonly storage: Storage = localStorage) {}

  async load(): Promise<Answer[]> {
    const raw = this.storage.getItem(LOG_KEY);
    if (raw !== null) {
      try {
        return JSON.parse(raw) as Answer[];
      } catch (e) {
        console.error("回答ログを読めませんでした", e);
        return [];
      }
    }
    return this.migrateLegacy();
  }

  async append(answer: Answer): Promise<void> {
    const log = await this.load();
    log.push(answer);
    try {
      this.storage.setItem(LOG_KEY, JSON.stringify(log));
    } catch (e) {
      // 容量の上限（およそ5MB）を超えたときなど。回答はメモリ上には反映済み
      console.error("回答ログを保存できませんでした", e);
      throw e;
    }
  }

  /** 旧形式の記録があれば回答ログに変換し、旧キーは tanto.legacy.* に名前を変えて残す */
  private migrateLegacy(): Answer[] {
    const legacyHistory = this.storage.getItem("tanto.history.v1");
    let log: Answer[] = [];
    if (legacyHistory) {
      try {
        log = convertLegacyHistory(JSON.parse(legacyHistory));
      } catch (e) {
        console.error("旧形式の記録を変換できませんでした", e);
      }
    }
    this.storage.setItem(LOG_KEY, JSON.stringify(log));
    for (const k of LEGACY_KEYS) {
      const v = this.storage.getItem(k);
      if (v !== null) {
        this.storage.setItem(k.replace(/^tanto\./, "tanto.legacy."), v);
        this.storage.removeItem(k);
      }
    }
    return log;
  }
}
