# T018 問題カード（穴埋め・個数など）の解説

- 状態：実装中（設計：2026-10-22 にユーザーが OK）
- マイルストーン：M2 拡充
- 優先度：中
- 依存：
- 更新：2026-10-22

## 目的・背景

- 解説は肢単位だけ。穴埋め・個数・向きのない選択などの問題カードには解説がない（R08 刑法で6問、民法 H27 問12）

## 議論（論点の候補）

- 問単位の解説の形（空欄ごと・語句ごとの説明）と、検査（公式の解答との整合）の方法

## 決まったこと（2026-10-22）

- 肢ごとの○×が決まらない問（`statement_truth_derivable` が false。372問のうち没問1問を除く 371問）に、**問ごとの解説**を1つ付ける
- 検査は「解説の正解＝公式の正解（解答欄の順。順不同の問は順を問わない）」。条文・判例の扱いは肢の解説と同じ
- T039 と同じループで回す（6本×3問）

## 設計

- データ：問の解説ファイル `data/explanations/<exam>/<year>/<subject>/q<NN>.json` に `question_explanation`（`stated_answer`・`conclusion`・`body`・`citations`・`cases`・`pending_cases`・`notes`・`prompt_version`・`generated_at`・`generated_by`・`version`）。肢の解説（`explanations`）はそのまま
- 指示：`prompts/explain-question-v1.md`（条文・判例・旧法は explain-v3 の規則をそのまま守る）。サブエージェント：`.claude/agents/explain-question-writer.md`
- キュー：`python3 pipeline/explain_queue.py --questions`。`--show` に【公式の正解】と【問の解説（T018）】を出す
- 検査：`check_explanations.py` の検査9（公式の正解との一致）。2〜5・7・8 は肢の解説と共通の `check_content`
- 後始末：`explain_commit.py` が、肢の解説・確かめ直しのキューが空なら問の解説のバッチ（mode `question`）を出す。NOW.md に「問の解説（T018）」の行
- 書き出し：検査を通った問の解説を束の `question_explanations` に。index.json の束に数
- 画面：「問で解く」の答え合わせに「この問の解説」。問ごとの静的ページの「正解と解説を見る」にも

## 完了条件

- 問題カードに解説が表示される
