-- T026：ブックマーク（★）。付けた／外したの操作を追記していき、肢ごとに一番新しい操作を正とする（端末で決める）
CREATE TABLE bookmarks (
  user_id      TEXT    NOT NULL,  -- Firebase の uid
  id           TEXT    NOT NULL,  -- 操作 ID（端末で作る UUID）
  statement_id TEXT    NOT NULL,
  marked       INTEGER NOT NULL,  -- 1＝付けた、0＝外した
  marked_at    TEXT    NOT NULL,  -- 操作した日時（端末の時刻、ISO）
  received_at  TEXT    NOT NULL,  -- サーバーが受け取った日時（差分の取得に使う、ISO）
  PRIMARY KEY (user_id, id)
);
CREATE INDEX bookmarks_user_received ON bookmarks(user_id, received_at);
