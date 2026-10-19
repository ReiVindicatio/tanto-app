# T001 自動テストと CI

- 状態：完了（設計レビュー OK・実装レビュー OK：2026-10-18、CI 緑：2026-10-19）
- マイルストーン：M1 基盤
- 優先度：高
- 依存：
- 更新：2026-10-18

## 目的・背景

- 今の確認は、パイプラインの実行時チェック（validate・check_explanations）と、headless Chrome での手動の確認（スクリプトは一時フォルダに置いただけ）しかない
- T020 の実装で、ホームの作りを変えたときに確認スクリプトが古くなっていたことに気づいた。**確認の手順がリポジトリになく、自動で流れていない**のが原因
- 以後のチケット（名寄せ・他の科目・同期）で、既存のデータと機能を壊していないかを自動で確かめたい

## 設計

### 1. パイプラインの回帰テスト（「作り直して差分がないこと」を確かめる）

- `pipeline/regen.py` を作る。取り込み済みの全対象（今は予備 民法15年度・刑法 R08）について、段階2以降（正答表・問題文の構造化 → 検証 → 導出 → 解説の検査 → アプリへの書き出し）を作り直す
- 対象の一覧は `pipeline/targets.json`（試験・年度・科目群・科目）に置き、取り込みを足したらここに1行足す
- テストは「`regen.py` を流したあと `git diff --exit-code data/ app/public/data/ reports/` で差分がない」こと。パーサを直したときに、意図しない変化が出たら差分として見える

#### 段階1（PDF の読み取り）を作り直しの対象から外す（設計の変更を含む）

- 今は、正答表の読み取り（`parse_answers.py`）が実行のたびに `pdftotext -tsv` を呼んでいる。poppler の版が違うと座標が少し変わりうるので、CI（Ubuntu）と手元（Mac）で結果がずれるおそれがある
- **提案**：段階1（`extract.py`）で、正答 PDF の `-tsv` の出力も `data/extracted/…/<名前>.tsv` として保存し、`parse_answers.py` はそれを読むだけにする
- これで、段階2以降は**コミット済みのファイルだけから決定的に作り直せる**（CI に poppler が要らない）。PDF からのテキスト化は、新しい PDF を取り込むときだけ手元で行う

### 2. アプリの単体テスト（Vitest）

| 対象 | 確かめること |
|---|---|
| `learning.ts` | ログの流し直し（集計・最後の正誤・新規の数）、同じ回答 ID の重複を1回だけ数える、日時の順に並べ直す |
| `store.ts` | LocalStorageStore の読み書き（偽の Storage で）、旧形式の変換と `tanto.legacy.*` への退避 |
| `srs.ts` | 期限の来た肢の順、同じ問の肢は1枚まで、新規は科目ごとに1日20枚 |
| `history.ts` | 未回答・前回まちがえたの絞り込み、集計 |
| `grade.ts` | 単一・組合せ・順不同（逆順でも満点）・部分点（4問正解で2点・順不同の部分点）・小問つき |

### 3. アプリの E2E テスト（Playwright）

- 一時フォルダの確認スクリプト（puppeteer）を、Playwright のテストとして `app/e2e/` に入れ直す
  - 肢で解く（データの○×どおりに答えて全問正解）・問で解く（誤答・順不同・部分点で 26/30 点）・全年度モードと改正前の切り替え・絞り込み・今日の復習（兄弟の抑制・新規の枠）・再読み込み後の状態・旧形式の変換・小問つきの問
- Playwright にした理由：テストの書き方と失敗時の記録（スクリーンショット）がそろっていて、CI でブラウザを用意する手順も決まっている

### 4. CI（GitHub Actions）

- `.github/workflows/ci.yml`：push ごとに2つのジョブを流す
  - **pipeline**：Python 3.9 で `regen.py` → `git diff --exit-code`
  - **app**：Node 22 で `npm ci` → 型検査とビルド → Vitest → Playwright（`vite preview` を立てて）
- private リポジトリの無料枠（月2,000分）で足りる見込み（1回数分）

### 5. 手元で流すコマンド

```
python3 pipeline/regen.py && git diff --exit-code data/ app/public/data/ reports/   # パイプライン
cd app && npm test        # 単体テスト
cd app && npm run e2e     # E2E
```

README と CLAUDE.md（進め方）に、「チケットの実装レビューに出す前に、この3つを流す」と書く。

## 設計レビューで決まったこと（2026-10-18）

1. 正答 PDF の `-tsv` を段階1で保存する（「保存したほうがいい」）
2. ツールは勧めどおり（作り直して差分を見る／Vitest＋Playwright）
3. push は案A：チケットが完了したときに Claude が main に push してよい（CLAUDE.md に書く）

## 設計で決めてほしいこと（レビュー前の記録）

1. 正答 PDF の `-tsv` を段階1で保存し、段階2以降を保存済みファイルだけから作り直せるようにする（`data/extracted/` に .tsv が増える）
2. ツール：パイプラインは「作り直して差分を見る」方式、アプリは Vitest＋Playwright
3. **CI を動かすには GitHub への push が要る**（今は手元に commit がたまっていて、push はしていない）。push をどうするか
   - 案A（勧め）：チケットが完了したときに、Claude が main に push してよい（CLAUDE.md に書く）
   - 案B：今まで通り、ユーザーが指示したときだけ push する（CI は push したときにだけ流れる）

## 実装（2026-10-18）

| 対象 | ファイル |
|---|---|
| 段階1で正答表の座標を保存 | `pipeline/extract.py`（`<名前>_正答.tsv`、99件・約3MB）、`pipeline/parse_answers.py` は .tsv を読むだけに（PDF・poppler を使わない） |
| パイプラインの回帰 | `pipeline/targets.json`（対象16件）、`pipeline/regen.py`（段階2以降と解説の検査・書き出しを作り直す。約10秒） |
| 単体テスト（Vitest・19件） | `app/src/{learning,store,srs,history,grade}.test.ts`、`app/src/test/fakes.ts` |
| E2E（Playwright・6件） | `app/e2e/{drill,records}.spec.ts`、`app/playwright.config.ts` |
| CI | `.github/workflows/ci.yml`（pipeline：Python 3.9 で regen → git diff／app：build → Vitest → Playwright） |
| 文書 | README（テストの流し方）、CLAUDE.md（実装レビューの前に3つとも流す） |

### 確認した結果（手元）

- regen を流すと、小問の欄（`sub_questions: []`）を足す前に作った `data/parsed/` の古いファイル13件に、その欄が増えた（正本・アプリのデータは変化なし）。**作り直していない古いファイルが見つかった**ので、作り直した結果をコミットする。2回目の regen は差分なし（決定的）
- 段階1を流し直しても `.txt` は1件も変わらない（`.meta.json` に `tsv` 欄が増えただけ）
- 単体テスト 19件・E2E 6件がすべて通る（E2E 約11秒）
- **わざと壊した確認**：導出の根拠ラベルを1行変える → regen で32ファイルに差分。採点の順不同の判定を1行変える → 単体テストが1件落ちる。元に戻すと通る
- 途中で E2E が1件落ちた：年度が1つの科目は「年度ごと」が最初から開いているのに、テストがクリックで閉じていた（テスト側の誤り。開いた状態にするよう直した）

### 結果

- 2026-10-19 に push し、GitHub Actions の pipeline・app の両ジョブが緑になった（ユーザーが確認）
- このマシンには gh CLI がなく、Claude からは CI の結果を見られない（必要ならユーザーが `brew install gh` → `gh auth login`）

## 完了条件

- 手元で3つのコマンドが通る
- GitHub Actions で緑になる
- わざと壊した変更（パーサの1行・採点の1行）で、テストが落ちることを確かめる
