# T001 自動テストと CI

- 状態：起票
- マイルストーン：M1 基盤
- 優先度：高
- 依存：
- 更新：2026-10-18

## 目的・背景

- 今の検証は、パイプラインの実行時チェック（validate・check_explanations）と、ブラウザでの手動確認（headless Chrome のスクリプトは scratchpad に置いただけ）しかない
- チケットで機能を足していく前に、既存の動きを壊していないかを自動で確かめる仕組みが要る

## 議論（論点の候補）

- パイプラインの回帰テスト：取り込み済みの全年度で parse → validate → derive を流し、正本（`data/questions/`）と差分がないことを確かめる
- アプリの単体テスト：採点（`grade.ts`）・FSRS の出題（`srs.ts`）・絞り込み（`history.ts`）
- アプリの E2E：今回 scratchpad で書いた headless Chrome の確認（肢カード・問で解く・履歴・復習）をリポジトリに入れる
- CI：GitHub Actions で push ごとに上の3つを流す（private リポジトリの無料枠で足りるかは要確認）

## 設計

（議論で方針が決まってから書く）

## 完了条件

- `npm test`（アプリ）と `python3 -m pipeline.tests`（仮）で全部流れる
- GitHub Actions で緑になる
