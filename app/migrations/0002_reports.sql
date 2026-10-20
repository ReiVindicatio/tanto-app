-- T040：誤り報告。退会しても報告は消さず、送った人（user_id）だけ消す（NULL にする）
CREATE TABLE reports (
  id          TEXT NOT NULL PRIMARY KEY,   -- 端末で作る UUID（送り直しで重複しない）
  user_id     TEXT,                        -- Firebase の uid。退会したら NULL
  target      TEXT NOT NULL,               -- 肢 ID または問 ID
  kind        TEXT NOT NULL,               -- question（問題文）／truth（○×）／explanation（解説）／other
  body        TEXT NOT NULL,               -- 500字まで
  context     TEXT NOT NULL,               -- JSON：解説の版など（アプリが自動で付ける）
  created_at  TEXT NOT NULL,               -- サーバーが受け取った日時（ISO）
  status      TEXT NOT NULL DEFAULT 'open' -- open／done／wontfix（Claude のセッションで処理して書き換える）
);
CREATE INDEX reports_user_created ON reports(user_id, created_at);
CREATE INDEX reports_status ON reports(status, created_at);
