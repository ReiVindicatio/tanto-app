# たんたん（tanto-app）

予備試験・司法試験の**短答式過去問を一問一答で学ぶ**、無料の学習 Web アプリ。将来はアプリ化（Capacitor）と広告収入を想定。自分の学習用も兼ねる。

> 状態：**基盤（M1）が完了した段階**（📖 [docs/features.md](docs/features.md)・[tickets/README.md](tickets/README.md)）。📖 [docs/design.md](docs/design.md)／PDF の棚卸し [docs/inventory.md](docs/inventory.md)

## パイプラインの実行

Python 3.9 以上（標準ライブラリのみ）と poppler（`brew install poppler`）が要る。
テキスト層が壊れた PDF の復元（`repair_text.py`）だけは、`python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements-repair.txt` と、Microsoft Office に同梱の MS 明朝・MS ゴシックが要る（復元した結果を commit するので、段階2以降と CI には要らない）。

```
python3 pipeline/extract.py --match R08-2026                      # 段階1：テキスト化（品質スコア・科目見出し・正答表の座標 .tsv）
.venv/bin/python pipeline/repair_text.py --match R07-2025           # 段階1の補助：テキスト層が壊れた PDF の復元（決定017。pypdf・fontTools と MS 明朝／ゴシックが要る。上記）
python3 pipeline/parse_answers.py R08-2026 刑法刑事訴訟法           # 段階2b：正答表
python3 pipeline/parse_questions.py R08-2026 刑法刑事訴訟法 刑法    # 段階2a：問題文
python3 pipeline/validate.py R08-2026 刑法刑事訴訟法 刑法           # 段階3：検証 → reports/validation/
python3 pipeline/derive.py R08-2026 刑法刑事訴訟法 刑法             # 段階5：肢の○×を導出 → data/questions/（正本）
python3 pipeline/egov.py 民法 5 6                                  # 保存済みの条文を表示（data/statutes/。取り直しは --fetch 民法／--fetch-all）
python3 pipeline/check_explanations.py yobi 2026 minpo 1           # 段階6の検査：解説と公式の○×・条文の照合
python3 pipeline/export.py                                         # 段階7：検証が ✅ のものだけ app/public/data/ へ
```

## テスト（T001）

```
python3 -m unittest discover -s pipeline/tests                    # パイプラインの単体テスト
python3 pipeline/regen.py && git diff --exit-code --stat data/ app/public/data/ reports/   # パイプラインの回帰（作り直して差分なし）
cd app && npm test                         # 単体テスト（Vitest）
cd app && npm run build && npm run e2e     # E2E（Playwright。初回は npx playwright install chromium）
cd app && npm run e2e:sync                 # 同期の E2E（テスト用ログインでビルドし、wrangler dev＋手元の D1 で流す）
cd app && npm run typecheck:worker         # API（Worker）の型検査
```

GitHub Actions（`.github/workflows/ci.yml`）が push ごとに同じものを流す。取り込みを足したら `pipeline/targets.json` に1行足す。

## 公開先（T002）

- **https://tantan.reivindicatio0321.workers.dev/**（Cloudflare Workers の静的配信。当面は検索エンジンに載せない）
- main に push すると、Cloudflare が `app/` で `npm ci && npm run build` を流し、`app/dist/` を配信する（設定は `app/wrangler.jsonc`、Node の版は `app/.node-version`）
- 公開先に向けて E2E を流す：`cd app && BASE_URL=https://tantan.reivindicatio0321.workers.dev npm run e2e`

## ログインと同期（T003・決定012）

```
アプリ ─ Google ログイン（Firebase Authentication）→ ID トークン
  └→ API（Cloudflare Workers：app/worker/）─ ID トークンを検証 → その人の回答ログだけ読み書き
       └→ DB（Cloudflare D1：tantan）─ 保存処理は app/worker/repository.ts の AnswerRepository だけ
```

- サーバーに置くのは回答ログと誤り報告だけ（利用者 ID は Firebase の uid。メールアドレスは置かない）。FSRS の状態は端末で作る
- 誤り報告の処理は 📖 `docs/reports.md`。使いすぎの制限（`wrangler.jsonc` の `ratelimits` と、1日の上限）は超えても画面に出さない（T040）
- DB を入れ替えるときは `AnswerRepository` の実装を足して `app/worker/index.ts` で渡す（アプリ側は変わらない）
- D1 の表を変えるときは `app/migrations/` に SQL を足し、`cd app && npx wrangler d1 migrations apply DB --remote`（要 `npx wrangler login`）
- 手元の開発・E2E では「テスト用ログイン」を使う（`npm run e2e:sync`）。本番の設定でテスト用ログインが有効なら API は止まる

## アプリの起動

```
cd app && npm install && npm run dev      # http://localhost:5173/
```

## 方針（決定済み）

- 素材は**法務省が公開している問題・正解の PDF だけ**。他社の解説・分類・データは一切使わない
- 正答は公式データで担保する。**AI の役割は「OCR・抽出ミスの補正」と「解説生成」に限る**
- 誤りはユーザーからの報告で直す（報告タブ）
- Web（React 等）で作り、後から Capacitor で iOS／Android にできる構成にする
- 生成は一気にやらず、学習の進捗に合わせて科目ごとに少しずつ流す
- 最初のスコープ：**予備試験・刑法・直近1年度（R08-2026）**を、PDF → 構造化データ → 問題カード表示まで一気通貫で通す

## 出典

問題・正解は法務省ウェブサイトの公開資料による（公共データ利用規約 第1.0版）。このアプリが編集・加工しており、法務省が作成したものではない。
出典：法務省ウェブサイト（https://www.moj.go.jp/jinji/shihoushiken/）
