import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initLearning, reloadLearning } from "./learning";
import { LocalStorageStore } from "./store";
import { createAuthClient } from "./auth";
import { HttpApiClient } from "./api";
import { SyncedStore } from "./sync";
import "./styles.css";

// 学習記録（回答ログ）：端末に保存し、ログインしていればサーバー（/api）と同期する（T003）
const auth = createAuthClient();
const sync = new SyncedStore(new LocalStorageStore(), new HttpApiClient(() => auth.getToken()), auth, localStorage, () => reloadLearning());

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
