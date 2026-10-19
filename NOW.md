# いま何をやるか

> **このファイルは毎回上書きする。**作業のリストは `tickets/README.md`（ボード）、機能の一覧は `docs/features.md`、履歴は git と `docs/decisions/`。

**更新：2026-10-19（ユーザー不在中に T021・T009・T012 を進めた。未 commit）**

## 現在地

- M1（基盤）完了。M2（拡充）を進行中
- 公開先：https://tantan.reivindicatio0321.workers.dev/（main に push すると自動で更新）
- **作業ツリーに未 commit の変更がある**（T021・T009・T012 の3つ分。実装レビューの OK をもらってからチケットごとに commit・push する）

## レビュー待ち（ユーザー）

1. **T021 同期の回数を減らす** → 実装レビュー。`tickets/T021-sync-batching.md`
   - 回答のたびには送らず、60秒・30件・画面を隠したときにまとめて送る。受け取りは起動・ログイン・オンライン復帰・画面に戻ったとき（5分以上たっていれば）
   - 変更ファイル：`app/src/sync.ts`・`api.ts`・`main.tsx`・`sync.test.ts`・`e2e-sync/sync.spec.ts`
2. **T009 刑法・刑訴の取り込み** → 実装レビュー＋決めてほしいこと2点。`tickets/T009-yobi-keiho-keiso.md`
   - 刑法12年度・刑訴12年度を取り込んだ（肢カード 567＋540）。区分を選ぶ形式の9問で6セットが止まっている → **新しい形式 `classify_each` を足すか**（スキーマ変更）
   - 刑法の改正（拘禁刑・性犯罪規定）の注意書きを具体的にするか
   - **既存データの修正**：商法・民訴の8セット・10問で、末尾の「（参照条文）」が最後の肢・選択肢にくっついていたのを、前提文に切り出した（○×の変化なし）
3. **T012 解説：民法 R05〜R02** → 実装レビュー。60問・300肢すべて検査を通過（民法の解説は R08・R06〜R02 の計450肢に）
   - **R03 問13エは出題後の改正（2024年4月施行の嫡出推定の見直し）で正誤が逆になる**（出題時点×→現行法○）。要確認（law_changed）として肢カードから外した → 扱いの確認をお願いしたい（`tickets/T012-explain-minpo.md` の「決めてほしいこと」）
   - 改正の確認用に `pipeline/revisions.py` を作った（T004 の決定どおり。e-Gov v2 で出題時点の版と比べる）

## commit するときの分け方

| チケット | ファイル |
|---|---|
| T021 | `app/src/sync.ts`・`app/src/sync.test.ts`・`app/src/api.ts`・`app/src/main.tsx`・`app/e2e-sync/sync.spec.ts`・`tickets/T021-sync-batching.md` |
| T009 | `pipeline/parse_questions.py`・`pipeline/validate.py`・`pipeline/targets.json`・`pipeline/tests/test_parse_questions.py`・`data/parsed/`・`data/questions/`・`app/public/data/`（解説以外）・`reports/`・`app/e2e/subjects.spec.ts`・`docs/features.md`・`tickets/T009-yobi-keiho-keiso.md` |
| T012 | `pipeline/revisions.py`・`data/statutes/changes/`・`data/explanations/yobi/2023/`〜`2020/`・`app/public/data/yobi-2023〜2020-minpo.json`（解説の分）・`data/review/flags.json`・`app/src/QuestionBody.tsx`（要確認の文言）・`app/e2e/records.spec.ts`・`tickets/T012-explain-minpo.md` |
| 共通 | `tickets/README.md`・`NOW.md` |

## 次の一手（提案）

1. 上の3つのレビュー（T021 は小さい。T009 は決めてほしいこと2点）
2. 民法の解説の続き（R01 以前は債権法改正前 → T013 の方針が先）
3. その後 **T022＋T023**（クイックスタート・結果画面）

## 上限のメモ（2026-10-19 確認）

- D1：1回の API 呼び出しで SQL 50回まで。書き込み1日10万行・読み込み1日500万行（無料）
- Workers：API の呼び出し1日10万回（無料。静的ファイルの配信は数えない）→ T021 で1人1日約35回に
- Workers Builds（デプロイ）：月3,000分・同時1本（無料）
