-- T070：特別な衣装のお試しと「欲しい」。tried_at は1人1着1回の制限に使う。wanted_at は買えるようになる前に人気を見るため（NULL＝取り消した／押していない）
CREATE TABLE special_interest (
  user_id    TEXT NOT NULL,  -- Firebase の uid
  costume    TEXT NOT NULL,
  tried_at   TEXT,           -- お試しを始めた日時（サーバーの時刻、ISO）
  wanted_at  TEXT,           -- 「欲しい」を押した日時（サーバーの時刻、ISO）
  PRIMARY KEY (user_id, costume)
);
