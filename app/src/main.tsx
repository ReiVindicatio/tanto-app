import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initLearning } from "./learning";
import { LocalStorageStore } from "./store";
import "./styles.css";

// 学習記録（回答ログ）を読み込んでから画面を出す。保存先を替えるときはここで別の RecordStore を渡す
initLearning(new LocalStorageStore()).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
