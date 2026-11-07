-- 持っている特別な衣装（T074）。ベータ版の特典で渡した衣装を記録する。買えるようになったら、購入もここに入れる
CREATE TABLE special_owned (
  user_id    TEXT NOT NULL,  -- Firebase の uid
  costume    TEXT NOT NULL,
  source     TEXT NOT NULL,  -- early（ベータ版の特典）
  granted_at TEXT NOT NULL,  -- 渡した日時（サーバーの時刻、ISO）
  PRIMARY KEY (user_id, costume)
);
