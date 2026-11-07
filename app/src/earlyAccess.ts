// ベータ版の特典（T074）：ベータ版の間にログインした人に、課金衣装の見本（星詠み）を渡す。もらった人はずっと着られる。
// Worker（渡す）とアプリ（案内を出す）の両方が読む。ベータを終えるときは until に日時（ISO）を書く。
// 縮める方向には変えない（早く来た人の扱いが変わる）。延ばすのはよい

export type EarlyAccess = { costume: string; from: string; until: string | null };

export const EARLY_ACCESS: EarlyAccess = {
  costume: "hoshiyomi",
  from: "2026-11-07T00:00:00+09:00",
  until: null,
};

/** 特典の期間の内か */
export function inEarlyAccess(now: Date, e: EarlyAccess = EARLY_ACCESS): boolean {
  const t = now.getTime();
  return t >= Date.parse(e.from) && (e.until === null || t < Date.parse(e.until));
}
