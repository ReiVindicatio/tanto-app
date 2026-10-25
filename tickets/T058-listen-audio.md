# T058 聞き流しを、作っておいた音声（Google Cloud TTS）の再生に切り替える

- 状態：完了（設計レビュー OK：2026-10-25）
- マイルストーン：M2 拡充
- 優先度：中
- 依存：T057
- 更新：2026-10-25

## 目的・背景

- T057 の聞き流しは端末の読み上げ（speechSynthesis）で、声が機械的すぎて聞くに耐えない（ユーザーの評価）。画面を消すと止まる
- 2026-10-25：Google Cloud Text-to-Speech で見本を作って聞き比べ、Chirp 3 HD の Achernar（女性）に決めた。全部の肢の音声を手元で作る（`pipeline/tts.py`。17,246本・約132万字・約1GB。無料トライアルのクレジット内）

## 議論（2026-10-25 決定）

- 音声は手元でまとめて作り、アプリは再生するだけ（API キーは手元だけ。サーバーに置かない）
- 声：Chirp 3 HD（Neural2 より、句読点のない所でも自然に区切って聞きやすい）。どれも許容範囲だった
- 1枚につき2本（肢／「正解は〜」＋解説の結論）。読む文が変わった肢だけ作り直す（manifest の sha256）

## 設計

### 置き場所（Cloudflare R2。新しく使う外部サービス）

- R2 のバケット `tantan-audio` を作り（`wrangler r2 bucket create`。無料枠：保存 10GB・読み出し月1,000万回、配信の転送量は無料）、`audio/tts/<声>/` をそのまま `tts/<声>/<カード ID>.q.mp3` などで上げる（`pipeline/tts_upload.py`：`wrangler r2 object put` を並べて流す。上げ済みで sha256 が同じものは飛ばす）
- Worker（`worker/index.ts`）に `/audio/*` を足し、R2 から返す（`run_worker_first` に `/audio/*`）
  - iPhone の Safari は音声を Range 付きで取りに来るので、Range に答える（206）
  - `Cache-Control: public, max-age=86400`。Cloudflare のキャッシュ（Cache API）にも入れて、R2 の読み出しと Worker の時間を減らす
  - Worker の呼び出しは1日10万回の無料枠に数えられる（聞き流し1肢で2回）。今の利用者の数なら十分。足りなくなったら有料プランか、独自ドメインで R2 を直接公開する
- 音声のない肢（作る前・失敗）は、端末の読み上げで読む（いまの仕組みを残す）

### アプリ（`ListenPlayer.tsx`）

- 読み上げ（speechSynthesis）を `<audio>` の再生に替える：肢 → 考える間 → 答えと結論。○×を押したら肢の再生を止めて答えへ
- 考える間は、無音の音声ファイル（3／5／8秒。アプリに同梱）を流して作る。JavaScript のタイマーは、画面を消すと止められることがあるため、再生の終わり（ended）の合図だけで次へ進める
- ロック画面の操作（Media Session API）：再生・一時停止・次の肢へ、と今の肢の出典を表示
- 次の肢の音声を1つ先に読み込んでおく（切り替わりの待ちを減らす）
- 読む速さ（0.8〜1.5倍）は `playbackRate` で（音の高さは保つ）
- 画面に「音声：Google Cloud Text-to-Speech で作成（AI 音声）」と出す。プライバシーポリシーは変えない（送るものはない。音声を取りに行くだけ）

### 先に言っておくこと

- 画面を消しても続くかは、端末とブラウザ次第。iPhone のホーム画面に追加したアプリ（PWA）は、裏に回ると音声が止まることがある。実機で確かめる（Safari のタブで開けば続くはず）
- 解説を直したら `python3 pipeline/tts.py` → `tts_upload.py` で、変わった肢だけ作り直して上げる

### テスト

- 単体：Worker の `/audio/*`（R2 にあるとき・ないとき・Range）
- E2E：音声のファイルを差し替えて、肢 → 間 → 答えの順に再生される・○×で答えに進む・音声がないときは読み上げに戻る

## 完了条件

- 聞き流しが、作っておいた自然な声で流れる。ロック画面から一時停止・次へができる

## 実装の記録

- R2：2026-10-25 にユーザーが R2 を有効にし、バケット `tantan-audio` を作った（公開はしない。読み出しは Worker 経由だけなので、Workers の無料プランの1日10万回の上限が R2 の読み出しの上限にもなり、無料枠を超えない）
- 音声：`pipeline/tts.py`（12本ずつ並べて作る。Google 側で絞られて1分に約120本）。古い年度の読点「，」「．」は「、」「。」にそろえる（Chirp 3 HD は長い文を受け付けず、区切りに使うため）。読点のない長いかたまりは助詞の後で切る
- 上げる：`pipeline/tts_upload.py`（`wrangler r2 object put` を8本並べる）
- Worker：`worker/audio.ts`（Range に 206 で答える・Cloudflare のキャッシュ）。`wrangler.jsonc` に `r2_buckets`（AUDIO）と `run_worker_first` の `/audio/*`
- アプリ：`src/listen.ts` の `play`・`audioUrl`・`silenceUrl`、`src/ListenPlayer.tsx`。押した答えの「正解。」「不正解。」は同じ声で作った短い音声（`public/sounds/seikai.mp3`・`fuseikai.mp3`）、考える間は無音（`public/sounds/silence-1/3/5/8.mp3`）。service worker は `/audio/`・`/sounds/` を保存しない
- テスト：単体 `worker/audio.test.ts`、E2E `e2e/listen.spec.ts`（流す順番・○で正解／不正解と答えへ・音声がないときは端末の読み上げ・一時停止と次へ）
- 2026-10-25：全部の音声 17,246本（約930MB）を作って R2 に上げた（手元の manifest と uploaded.json が全部一致）。12本ずつ並べると Google 側で 429 が返る（1,263本）ので、4本ずつで作り直した。読点のない74字以上のかたまりも Chirp 3 HD が断る（3本）ので、60字を超えたら助詞の後で切る
