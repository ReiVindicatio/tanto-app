# T002 公開（デプロイ）

- 状態：実装中（設計レビュー OK：2026-10-19。配置先は Pages から Workers に変更）
- マイルストーン：M1 基盤
- 優先度：高
- 依存：T001（完了）
- 更新：2026-10-19

## 目的・背景

- スマホから使う、ログイン（T003）を入れる、のどちらにも、URL で開ける状態が要る
- 決定001で Cloudflare Pages を第一候補にした（Vercel の無料プランは商用利用不可、GitHub Pages はオンラインビジネス向けの利用を認めていない）
- 料金（2026-10-19 確認）：無料プラン。ビルドは月500回まで（公式ドキュメント）、転送量は無制限とされる（二次資料）。push のたびに1回ビルドするので収まる

## 設計の変更（2026-10-19）

- ユーザーが Cloudflare の作成画面を開くと、既定が **Workers（静的なファイルの配信）** の Git 連携になっていた（Cloudflare は Pages の機能を Workers に寄せている）
- 公式ドキュメントで、**Workers でも静的なファイルへのリクエストは無料・無制限**と確認した（https://developers.cloudflare.com/workers/static-assets/billing-and-limitations ）ので、Workers で配置する
- プロジェクト名：**`tantan`**（「短答」と「淡々と続ける」）。URL は `https://tantan.<アカウントのサブドメイン>.workers.dev`
- リポジトリに `app/wrangler.jsonc`（名前 tantan、`dist/` を配信）を置き、`wrangler` を開発用の依存に足した

### Workers の画面での設定

| 項目 | 入れる値 |
|---|---|
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command（preview command） | `npx wrangler versions upload`（既定のまま） |
| Enable preview builds | Yes（ブランチの確認用 URL ができる） |
| Protect with Cloudflare Access | **No**（設計どおり鍵はかけない） |
| Path | `app` |
| API token / API token name | 既定のまま（Cloudflare が作る） |
| Variable | `NODE_VERSION` = `22` |

## 当初の設計（Pages 版。記録として残す）

### 1. 配置のしかた：Cloudflare Pages の Git 連携（勧め）

- Cloudflare が GitHub の main を見張り、push のたびにビルドして公開する。ブランチを push すると、確認用の別 URL（プレビュー）も作られる
- ビルドの設定：ルート `app`、コマンド `npm ci && npm run build`、出力 `dist`、環境変数 `NODE_VERSION=22`
- データ（`app/public/data/`）はコミット済みなので、Cloudflare 側で Python を動かす必要はない
- もう一つの方法（GitHub Actions から wrangler で配置）は、API トークンを作って GitHub の Secret に入れる手間が増えるので採らない

### 2. 公開の範囲：URL を知っている人だけ（検索に載せない）

- 当面は「自分専用」なので、検索エンジンに載らないようにする：`index.html` に `<meta name="robots" content="noindex">`、`public/robots.txt` で全拒否
- ログインのような鍵はかけない（URL を知っていれば開ける）。中身は法務省の公開資料と出典表記つきの解説なので、見られて困るものはない
- M3（公開）で外す

### 3. 見た目

- favicon：法務省を思わせない、○×をあしらった簡単なアイコン（SVG）
- アプリ名は「短答一問一答（仮称・非公式）」のまま（名前は M3 で決める）

### 4. Claude がやること（設計レビュー OK の後）

- noindex・robots.txt・favicon を入れ、テストを流して push
- 公開された URL で、E2E と同じ確認（肢で解く・問で解く・今日の復習）を手で行う
- README に URL と配置の仕組みを書く

## ユーザーにやってほしいこと（設計レビュー OK の後）

1. Cloudflare のアカウントを作る（無料。https://dash.cloudflare.com/sign-up ）
2. ダッシュボードで「Workers & Pages」→「作成」→「Pages」→「Git に接続」→ GitHub を認可する（**対象のリポジトリは `ReiVindicatio/tanto-app` だけに絞る**）
3. プロジェクト名を決める（URL が `https://<プロジェクト名>.pages.dev` になる。法務省・司法試験を名乗らない名前に。例：`tanto-drill`、`ichimon-tanto`）
4. ビルドの設定を入れる：
   - フレームワーク：なし（または Vite）
   - ルートディレクトリ：`app`
   - ビルドコマンド：`npm ci && npm run build`
   - 出力ディレクトリ：`dist`
   - 環境変数：`NODE_VERSION` = `22`
5. 「保存してデプロイ」を押し、できた URL を Claude に教える

## 設計で決めてほしいこと

1. 配置は Cloudflare Pages の Git 連携でよいか
2. 公開の範囲は「URL を知っている人だけ・検索に載せない」でよいか（鍵はかけない）
3. プロジェクト名（URL）

## 完了条件

- スマホのブラウザで URL を開いて、肢で解く・問で解く・今日の復習が動く
- main に push すると自動で更新される
- 検索エンジン向けに noindex になっている
