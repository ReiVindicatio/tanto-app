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
  auth.onChange(() => void sync.sync()); // 起動時・ログイン時
  window.addEventListener("online", () => void sync.sync()); // オンラインに戻ったとき
});
