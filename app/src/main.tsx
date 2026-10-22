import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initLearning, reloadLearning } from "./learning";
import { initBookmarks, reloadBookmarks } from "./bookmarks";
import { LocalStorageStore } from "./store";
import { createAuthClient } from "./auth";
import { HttpApiClient } from "./api";
import { SyncedStore } from "./sync";
import { applyTheme, watchSystemTheme } from "./theme";
import "./styles.css";

// テーマ（ダークモード）は描画の前に当てる（T025）
applyTheme();
watchSystemTheme();

// 学習記録（回答ログ）：端末に保存し、ログインしていればサーバー（/api）と同期する（T003）
const auth = createAuthClient();
const sync = new SyncedStore(new LocalStorageStore(), new HttpApiClient(() => auth.getToken()), auth, localStorage, async () => {
  await reloadLearning();
  reloadBookmarks();
});
initBookmarks(sync); // ★（T026）も端末に保存し、回答と同じ通信で同期する

initLearning(sync).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App auth={auth} sync={sync} />
    </StrictMode>,
  );
  auth.onChange(() => void sync.sync()); // 起動時・ログイン時：送って受け取る
  window.addEventListener("online", () => void sync.sync()); // オンラインに戻ったとき
  // 画面を隠したら未送信を送り、戻ったら（前回から5分以上たっていれば）受け取る（T021）
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void sync.flushOnHide();
    else void sync.onVisible();
  });
  window.addEventListener("pagehide", () => void sync.flushOnHide());
});

// オフラインで使うための Service Worker（T030）。開発中（npm run dev）は登録しない
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("Service Worker を登録できませんでした", e));
  });
}
