-- T003：回答ログ（サーバーに置くのはこれだけ。FSRS の状態は端末で回答ログから作る）
CREATE TABLE answers (
  user_id      TEXT    NOT NULL,  -- Firebase の uid（メールアドレスは置かない）
  id           TEXT    NOT NULL,  -- 回答 ID（端末で作る UUID）
  statement_id TEXT    NOT NULL,
  ok           INTEGER NOT NULL,  -- 1＝正解、0＝不正解
  answered_at  TEXT    NOT NULL,  -- 回答した日時（端末の時刻、ISO）
  received_at  TEXT    NOT NULL,  -- サーバーが受け取った日時（差分の取得に使う、ISO）
  PRIMARY KEY (user_id, id)
);
CREATE INDEX answers_user_received ON answers(user_id, received_at);
