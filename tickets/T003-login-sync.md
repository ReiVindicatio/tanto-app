# T003 ログインと端末間同期

- 状態：実装中（設計レビュー OK：2026-10-19。決めてほしいこと3点は勧めのとおり）
- マイルストーン：M1 基盤
- 優先度：高
- 依存：T002（完了）・T020（完了）
- 更新：2026-10-19

## 目的・背景

- ログインの実質的な価値は「**記録を失わない**」と「**端末（スマホと PC）をまたいで続きができる**」の2つ。正答数の管理そのものは、ログインがなくても端末の中でできている
- **いずれ公開することを念頭に置き、利用者数を見ながら DB だけを入れ替えれば済む設計にする**（ユーザー、2026-10-19）

## 議論の経緯

- 当初（決定001・2026-10-18）：Supabase（Auth＋Postgres）、サーバーには回答ログだけ
- 2026-10-19：ユーザーの要望（Google ログインだけでよい・Supabase は1週間で一時停止する・DB だけ入れ替えられるように）を受けて、**ログイン＝Firebase Authentication、API＝Cloudflare Workers、DB＝Cloudflare D1** に変更（📖 decisions/012）
- 変わらないこと：サーバーには回答ログだけを置き、FSRS は端末で作る。ログインしなくても今まで通り使える

## 設計

### 1. 全体の形

```
アプリ（ブラウザ）── Firebase Authentication（Google ログイン）→ ID トークン
   │  回答ログの送信・取得（Authorization: Bearer <ID トークン>）
   ▼
API：Cloudflare Workers（公開先の Worker に /api/* を足す。静的ファイルは今まで通り配信）
   │  ID トークンを検証 → 利用者 ID（Firebase の uid）を得る → その人の行だけ読み書き
   ▼
DB：Cloudflare D1（API の中の「保存処理」だけが D1 を知っている）
```

### 2. API

| メソッド・パス | 内容 |
|---|---|
| `GET /api/answers?since=<受信時刻>` | 自分の回答ログを返す（`since` を付けると、それ以降にサーバーが受け取った分だけ） |
| `POST /api/answers` | 回答ログをまとめて送る（1回 1,000件まで）。同じ回答 ID は無視（何度送っても二重にならない） |
| `DELETE /api/me` | 自分の記録を全部消す（公開時の退会に備えて、最初から用意しておく） |

- 認証：`Authorization: Bearer <Firebase の ID トークン>`。Worker で検証する（Google の公開鍵で署名を確かめ、発行者 `https://securetoken.google.com/<プロジェクトID>`・対象・期限を確かめる。ライブラリは `jose`）
- 入力の検査：肢 ID の形・正誤が真偽値・日時が ISO 形式・件数の上限。合わないものは 400
- 利用者 ID は**トークンから得たものだけ**を使う（リクエストの中身の利用者 ID は信じない）
- 保存処理は `worker/repository.ts` の1か所にまとめ、`AnswerRepository`（`list(userId, since)`・`insert(userId, answers)`・`deleteAll(userId)`）として切り出す。**DB を替えるときはこの実装を差し替える**

### 3. DB（D1）

```sql
CREATE TABLE answers (
  user_id      TEXT    NOT NULL,  -- Firebase の uid（メールアドレスは置かない）
  id           TEXT    NOT NULL,  -- 回答 ID（端末で作る UUID）
  statement_id TEXT    NOT NULL,
  ok           INTEGER NOT NULL,  -- 1＝正解、0＝不正解
  answered_at  TEXT    NOT NULL,  -- 回答した日時（端末の時刻）
  received_at  TEXT    NOT NULL,  -- サーバーが受け取った日時（差分の取得に使う）
  PRIMARY KEY (user_id, id)
);
CREATE INDEX answers_user_received ON answers(user_id, received_at);
```

- マイグレーションは `app/migrations/` に置き、wrangler で当てる

### 4. アプリ側（同期）

- `RecordStore` に `SyncedStore` を足す。端末の回答ログ（今の `LocalStorageStore`）を正とし、サーバーとは次のように合わせる
  - **回答したとき**：端末に追記し、「未送信の箱」（`tanto.outbox.v1`）に入れて、送れたら箱から消す（オフラインなら箱に残る）
  - **起動時・ログイン時・オンラインに戻ったとき**：未送信の箱を送る → サーバーから前回以降の分を受け取り、端末のログに足す（回答 ID で重複を除く）→ 学習の状態（集計・FSRS）を作り直す
- 回答ログは追記だけなので、2台で別々に解いても衝突しない（和集合で済む）
- **ログインしていないとき**：今まで通り端末だけで動く（`LocalStorageStore`）
- **初めてログインしたとき**：その端末にある記録を、アカウントに引き継ぐ（全部をサーバーに送る）
- **ログアウトしたとき**：その端末の記録を消す（共有の端末で他人に見られないように）。未送信が残っていてオフラインなら、消す前に警告する

### 5. 画面

- ヘッダーの右に「Google でログイン」。ログイン後は名前と「ログアウト」
- ホームに同期の状態（「同期済み」／「未送信 N 件」／「オフライン」）を小さく出す

### 6. 設定値の置き場

- Firebase の Web 用の設定値（apiKey・authDomain・projectId・appId）は、**公開されても問題ない値**（Firebase の仕組み上、ブラウザに渡る前提の値）なので、`app/src/firebase-config.ts` に置いてコミットする。秘密の値（サービスアカウントの鍵など）は使わない
- D1 のデータベース ID は `app/wrangler.jsonc` に書く（秘密ではない）

### 7. テスト

- 単体（Vitest）：`SyncedStore` の合わせ方（未送信の箱・重複除去・オフライン・初回ログインの引き継ぎ）を、偽の API で確かめる
- API（Vitest＋Cloudflare の Workers 用テスト環境）：トークンの検証（偽の鍵で署名したトークン）・利用者ごとの分離（他人の記録が見えない）・重複の無視・入力の検査・削除
- E2E：本物の Google ログインは自動化できないので、**手元の開発環境でだけ有効な「テスト用ログイン」**で同期の流れ（2つのブラウザで解いて、片方の記録がもう片方に出る）を確かめる。本番の設定にはテスト用ログインを入れず、入っていたら起動しないようにする
- 本番で：あなたのスマホと PC で、片方で解いた分がもう片方の「今日の復習」に出ることを確かめる

### 8. 料金（2026-10-19 時点。実装時に公式で確かめる）

- Firebase Authentication：Google ログインは無料の範囲（電話番号認証以外は上限なしとされる。二次資料）
- Cloudflare Workers：API へのリクエストは無料で1日10万件まで（静的ファイルの配信は数えない）
- Cloudflare D1：無料で読み込み500万行／日・書き込み10万行／日・5GB（公式）

### 9. 公開（M3）までに足すもの（今回はやらない）

- プライバシーポリシー・利用規約、使いすぎの制限、Apple ログイン（iOS アプリにする場合）

## あなたにやってほしいこと（設計レビュー OK の後）

1. **Firebase のプロジェクトを作る**（https://console.firebase.google.com/ 、無料の Spark プラン）
2. 「Authentication」→「Sign-in method」で **Google を有効**にする
3. 「Authentication」→「設定」→「承認済みドメイン」に `tantan.reivindicatio0321.workers.dev` を足す（`localhost` は最初から入っている）
4. 「プロジェクトの設定」→「マイアプリ」で **Web アプリを追加**し、表示される設定値（apiKey・authDomain・projectId・appId）を Claude に貼る
5. **D1 のデータベースを作る**：Cloudflare のダッシュボード →「ストレージとデータベース」→「D1」→「作成」、名前は `tantan`。作成後に表示される **データベース ID** を Claude に貼る

## 設計で決めてほしいこと

1. ログアウトしたら、その端末の記録を消す（共有の端末への配慮）でよいか
2. 初めてログインしたとき、その端末にある記録をアカウントに引き継ぐ、でよいか
3. Firebase の Web 用の設定値をリポジトリに置く（公開されても問題ない値）、でよいか

## 完了条件

- スマホと PC で同じ Google アカウントにログインし、片方で解いた記録がもう片方の履歴・「今日の復習」に反映される
- オフラインで解いた記録が、オンラインに戻ったときに失われずに送られる
- ログインしなくても今まで通り使える
- 他人の記録を読めない・書けないことがテストで確かめられている
- DB の保存処理が `AnswerRepository` の1か所にまとまっている
