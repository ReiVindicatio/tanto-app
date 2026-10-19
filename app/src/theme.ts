// 表示のテーマ（T025）。既定は端末の設定に合わせる（このときは何も保存しない）
export type ThemePref = "system" | "light" | "dark";

const KEY = "tanto.theme.v1";
const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function setThemePref(p: ThemePref): void {
  if (p === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, p);
  applyTheme();
}

/** <html data-theme="light|dark"> を付ける。端末の設定が変わったら付け直す */
export function applyTheme(): void {
  const p = getThemePref();
  const dark = p === "dark" || (p === "system" && !!media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function watchSystemTheme(): void {
  media?.addEventListener?.("change", applyTheme);
}
