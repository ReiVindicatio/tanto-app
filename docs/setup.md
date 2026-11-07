# 新しい環境で始める

別の端末や、前の会話を知らない Claude Code でも、ここから開発を続けられるようにするための手順書。**環境の作り方・どこに何があるか・失うと困るもの**を書く。作るものの中身は下の順に読む。

## 読む順番

1. `CLAUDE.md`：🔴 破ると実害が出る禁止事項と、進め方
2. `NOW.md`：今どこか、次に何をするか
3. このファイル
4. `docs/working-agreements.md`：コードから分からない、これまでに決まった進め方と好み
5. 必要なときに：`docs/features.md`（できていること）、`tickets/README.md`（チケット）、`docs/design.md`（設計）、`docs/decisions/`（決めた経緯）、`docs/ritsu-special-costumes.md`（課金衣装の作り方）

## 別の端末へ移る（最短）

作業の元データは R2 に控えてある（`pipeline/backup.py`）。

1. 下の「手順」の 1・2 で道具と clone を済ませる
2. `cd app && npx wrangler login`（Cloudflare のアカウントで承認）
3. `python3 pipeline/backup.py restore`：`audio/` の元データを取り戻し（約 3.3GB）、Claude Code のメモリも置く
4. 鍵を置く：`.secrets/` に `google-vertex-key` と `google-tts-key`（「鍵と秘密」）。**鍵は控えに入っていない。**生成をしない開発なら要らない
5. 「手順」の 3 で動くか確かめる

メモリは作業パスごとのフォルダに置かれる。Claude Code を別のパスで開いたら、`audio/home-backup/memory/` を `~/.claude/projects/<作業パスの英数字以外を - にした名前>/memory/` へコピーする。`audio/home-backup/` には Claude Code の設定と、これまでの作業用スクリプトもある。

`audio/` を増やしたら（絵を作ったら）、古い端末がなくなる前に `python3 pipeline/backup.py make` を流して `pipeline/backup_manifest.json` を commit する。

## どこに何があるか

| もの | 置き場所 | 新しい環境で |
|---|---|---|
| コード・テスト・指示文（`prompts/`）・サブエージェント（`.claude/agents/`） | git | clone で来る |
| 法務省の PDF（`data/raw/`）・過去問の正本（`data/questions/`）・解説（`data/explanations/`）・条文（`data/statutes/`） | git | clone で来る |
| ふつうの衣装の絵と声（`app/public/chars/`・`voices/`）・選んだ見本（`pipeline/ritsu_picks/`） | git | clone で来る |
| **課金衣装の絵・声・動画** | R2 `tantan-audio` の `special/<ID>/`（1,133 個）。**リポジトリは public なので git に入れない** | `download` で取り戻す（下） |
| 聞き流しの音声 | R2 `tantan-audio` の `tts/<声>/`（約 34,000 本） | 開発には要らない。アプリは本番の R2 を使う |
| 回答ログ・誤り報告 | Cloudflare D1 `tantan` | 手元の開発は `e2e:sync` が手元の D1 を作る |
| 秘密の鍵 | `.secrets/`（git の外。**控えなし**）と Cloudflare の secret | 自分で移すか作り直す（下） |
| **作業の元データ**（`audio/samples_char` 3.3GB：生成した絵の原本・候補・元の動画。音声の manifest） | R2 の `backup/<日付>/`（非公開。Worker から読めない）。一覧は `pipeline/backup_manifest.json` | `backup.py restore` |
| Claude Code のメモリ | `~/.claude/projects/<作業パスの英数字以外を - にした名前>/memory/`。控えは R2 の `backup/<日付>/home.tar` | `backup.py restore` |

## 手順

### 1. 道具

```
brew install poppler webp ffmpeg     # PDF のテキスト化・絵の変換・動画の変換
```

- **Node 22**（`app/.node-version`）
- **Python 3.9**（`python3 --version` で確かめる。違えば `brew install python@3.9`）：CI と同じ版にする。版が変わると Unicode の正規化の結果が変わり、`regen.py` の回帰に差分が出ることがある
- **Google Chrome**：動画の再生の確認に使う（テスト用の Chromium は H.264 を再生できない）

### 2. clone と依存

```
git clone https://github.com/ReiVindicatio/tanto-app.git && cd tanto-app
cd app && npm ci && npx playwright install chromium && cd ..

# 絵の生成・切り抜きと、壊れた PDF の復元に使うときだけ
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements-char.txt -r pipeline/requirements-repair.txt
```

パイプラインの本体は Python の標準ライブラリだけで動く。`CHAR_PY` と書いてある手順は `.venv/bin/python` を使う。

### 3. 動くか確かめる（鍵もログインも要らない）

```
python3 -m unittest discover -s pipeline/tests
python3 pipeline/regen.py && git diff --exit-code --stat data/ app/public/data/ reports/
cd app
npm test
npm run build && npm run e2e
npm run typecheck:worker
npm run dev      # http://localhost:5173/
```

GitHub Actions も push ごとに同じものを流す。ここまで鍵なしで通るので、CI が緑なら新しい環境でも動く。

### 4. Cloudflare にログインする（R2・D1 を触るとき）

```
cd app && npx wrangler login
```

ブラウザでユーザーの承認が要る。Claude はユーザーに頼む。

### 5. 課金衣装を手元で確かめる

課金衣装は git にないので、手元では絵が出ない。R2 から取り戻して、本物の絵で開く。

```
python3 pipeline/ritsu_special_finish.py download all          # audio/samples_char/special/ へ。sha256 も確かめる（約 75MB）
cd app && npm run build && npx vite preview --port 4176 --strictPort   # 別の窓で
node scripts/special-preview.cjs hoshiyomi                     # 窓が開く。--shots <フォルダ> なら撮って終わる
```

衣装の ID は `hoshiyomi`（星詠み）`nocturne`（司書）`yukihana`（雪花）`hakama`（袴）`diva`（歌姫）`rock`（ロッカー）。本番の通行証は使わず、スクリプトが `/special/*` を手元のファイルで返す。

実機や本番で見るときは、`ADMIN_EMAILS` に入っているアカウントでログインする。

### 6. Claude Code

- **メモリ**：`backup.py restore` が置く。ユーザー個人のことはリポジトリに書かない決まりなので（public にするときに CLAUDE.md から外した）、メモリにしかない。控えより新しいことはユーザーに聞き直す
- **権限の設定**：`.claude/settings.local.json` は git に入らない。控えが `audio/home-backup/settings.local.json` にある（パスが違えば直す）
- **解説の連続生成**：`prompts/explain-runbook.md`。状態のファイル（`.claude/current_batch.json` など）は git の外で、なくても動く

## 鍵と秘密

中身はどこにも書かない。チャットにも出さない。

| 名前 | 置き場所 | 何に使う | 作り直し方 |
|---|---|---|---|
| `google-vertex-key` | `.secrets/` | 絵（`char_image.py`）・動画（`ritsu_video.py`）・声1と律の声（`tts_gemini.py`） | Google Cloud でサービスアカウントにひも付けた API キーを作り、Agent Platform API だけに絞る |
| `google-tts-key` | `.secrets/` | 聞き流しの声2（`tts.py`。環境変数 `GOOGLE_TTS_API_KEY` でも可） | Google Cloud で Cloud Text-to-Speech API だけに絞った API キーを作る |
| `gemini-key` | `.secrets/` | 今のパイプラインでは使っていない | 要らない |
| `ADMIN_EMAILS` | Cloudflare の secret | 管理者のメールアドレス。**コードに書かない** | `cd app && npx wrangler secret put ADMIN_EMAILS`。値はユーザーに聞く |
| `SPECIAL_KEY` | Cloudflare の secret | 課金衣装の通行証の署名 | 同じく `secret put`。読み出せないが、入れ替えても通行証が作り直されるだけ |

`app/src/firebase-config.ts` の Firebase の値は、ブラウザに渡す公開の設定で、秘密ではない。

手元の Worker の開発で値が要るときは `app/.dev.vars`（git の外）。`e2e:sync` は要らない（`--var` で渡す）。

## 外部サービス

| サービス | 中身 | メモ |
|---|---|---|
| GitHub `ReiVindicatio/tanto-app` | コード。**public** | CI は `.github/workflows/ci.yml`。`gh` がなければ `curl https://api.github.com/repos/ReiVindicatio/tanto-app/actions/runs?per_page=3` で結果を見られる |
| Cloudflare Workers `tantan` | https://tantan.reivindicatio0321.workers.dev/ | main への push で自動で配信（Workers Builds：`app/` で `npm ci && npm run build`）。**CI の結果を待たない** |
| Cloudflare D1 `tantan`・R2 `tantan-audio` | 回答ログ・音声と衣装 | 設定は `app/wrangler.jsonc`。表の変更は `app/migrations/`（README） |
| Firebase `tantan-adce9` | Google ログイン | サーバーの鍵は要らない（公開鍵で ID トークンを検証する） |
| Google Cloud（プロジェクト番号は `char_image.py`） | 絵・動画・声の生成 | 無料トライアルのクレジット。**期限は 2027-01-24**。残りは `NOW.md` |
| Search Console・Bing Webmaster Tools | 検索の登録 | ユーザーのアカウント。Bing などへは IndexNow でも URL を知らせる：配信のあと `cd app && node scripts/indexnow.mjs --since <YYYY-MM-DD>`（初回だけ全件。T073） |

無料枠の上限は `NOW.md` の「上限のメモ」。

## 費用がかかるコマンド

生成のスクリプトの多くは「**ない絵だけを作る**」。元データのない環境で流すと、ないものを全部作り直す。

| コマンド | 元データがないと | 守り |
|---|---|---|
| `pipeline/tts.py` | manifest がなければ約 34,000 本を作り直す（声1は約85ドルの見込み）。`backup.py restore` のあとなら、文が変わった分だけ作る | manifest がなければ止まる。`--from-scratch` でだけ進む |
| `pipeline/ritsu_motion.py <ID>` | 原本（`themes/<ID>/proto/sit-wind-*.png`）がないと止まる。原本があれば、`ritsu_motions.json` にあって配信していない動きだけ作る | 配信中の `motion-*.mp4` があれば、別の出来で上書きしない |
| `pipeline/ritsu_theme.py build <ID>` | その衣装の絵約60枚を別の絵で作り直す | **守りなし。元データなしでは流さない** |

どれも流す前に、ユーザーに見込みの費用を伝える。

## 控えの範囲

| もの | 控え | なくなると |
|---|---|---|
| `audio/samples_char/themes/<ID>/proto/`（課金衣装の原本、387MB） | R2 `backup/` | **新しいモーションも、表情を足すことも、作れなくなる。**`ritsu_motion.py`・`ritsu_wind.py` はこの PNG から作るので、配信用の webp では代わりにならない。一番大事 |
| `audio/samples_char` のほかの絵と元の動画（全部で 3.3GB） | R2 `backup/` | 絵の原本と選ばなかった候補が消える |
| `audio/tts/*/manifest.json`・`uploaded.json` | R2 `backup/` | どの文で音声を作ったかが分からなくなり、解説を直したときに差分だけ作れない |
| `audio/tts/` の mp3（3GB） | R2 `tts/` が本体。控えには入れない。手元になくても `tts.py` は作り直さない | 配信は止まらない |
| `.secrets/` の鍵 | **なし**（平文で置かない） | Google Cloud で作り直せる。パスワード管理のツールなどに自分で移してもよい |
| Cloudflare の `ADMIN_EMAILS`・`SPECIAL_KEY` | Cloudflare にある | 端末が変わっても消えない |

**消えても大丈夫なもの**：`.cache/courts/`（裁判所のページの控え。要るときに取り直す）、`screenshots/`、`app/dist/`、Claude Code の scratchpad。

R2 の無料枠は 10GB（控えを入れて約 6.5GB）。`backup.py make` を流すたびに日付ごとに増えるので、古い `backup/<日付>/` は確かめてから消す。

## はまりどころ

- **ファイル名の大文字小文字**：macOS は区別しないので、`backdrop.ts` と `Backdrop.tsx` は `./Backdrop` の解決でぶつかる（2026-11-04 にやった）。CI の Linux では逆に区別される
- **法務省サイト**：User-Agent なしの curl に 403 を返す。ブラウザの User-Agent を付ける
- **wrangler の R2**：一覧を取るコマンドがないので、課金衣装の一覧は `pipeline/ritsu_special_files.json` に残す（`upload` で自動で更新）。`--remote` を忘れると手元の偽物の R2 を読み書きする
- **R2 への上げ直し**：`upload` は更新時刻で変わったものだけ上げる。たまに通信で落ちるので、そのときは流し直す
- **E2E のスワイプ**：`swipe.spec.ts` がまれに CI で落ちる（`NOW.md`）
- **動画の確認**：Playwright は `channel: "chrome"` にする
- **Artifact の確認ページ**：Claude Code の機能で、URL はユーザーのアカウントでだけ開ける。残らなくても開発は困らない
