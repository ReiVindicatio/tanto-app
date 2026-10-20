# 解説の連続生成の手順（メインのセッション用。T039・決定021）

> `/loop` で回す。1回の起動で、下の「1回分」を時間とトークンの許す限りくり返す。止まっても、次の起動で続きから再開できる（進み具合はファイルとキューが持つ）。

## 1回分（バッチ）

1. `git status --short` で、前のバッチの書きかけが残っていないか見る。残っていれば、その問の `check_explanations.py` を通し直してから 4 へ
2. `python3 pipeline/explain_queue.py --next 9` で次の9問を取る。0問なら終わり（NOW.md に「解説の生成キューが空」と書いて commit・push し、`/loop` を止める）
3. **サブエージェントを3本、同じメッセージで並行して起動する**（`run_in_background: true`）。1本に3問ずつ渡す。渡す内容は「サブエージェントへの指示」（下）
   - 起動したら `ScheduleWakeup`（600秒）で待つ。戻った知らせ（task-notification）で起こされる
   - **起動から20分を超えて戻らない1本は `TaskStop` で打ち切る**（許可待ちで止まっている可能性がある。2026-10-20、1本が許可待ちのまま約11時間止まり、全体が止まった）。打ち切った問は解説ファイルが不完全でも検査で落ちる肢は公開されず、ファイルのない問はキューに残るので次のバッチで作り直される
   **メインのセッションも、許可していない操作をしない**：ヒアドキュメント・`&&` でつないだ複合コマンド・その場で書く python は、許可の設定に当たらず承認待ちで止まる（2026-10-20、これで何度も止まった）。バッチの後始末は 4〜7 をまとめた `python3 pipeline/explain_commit.py [--skip <question_id> "<理由>"]…` の1コマンドだけで行う。法令を足すときは `pipeline/egov.py` を Edit の道具で直し、`python3 pipeline/egov.py --fetch <法令>` を単独で実行する
4. 全部が戻ったか打ち切ったら：
   - 「法令がない」と報告された法令は、`pipeline/egov.py` の `LAWS` に足して `--fetch` する（法令番号は e-Gov の法令名の照合で確かめる。取れなければ足さない）。その問はキューに残るので、次のバッチで作られる
   - 2回直しても検査に通らない問・食い違い（🔴）が出た問は、`data/review/explain_skips.json` に `{question_id, reason, at}` で足す（キューから外れる）
5. `python3 pipeline/regen.py` を通す（解説の検査の書き戻し・書き出し。失敗したら原因を直す。直せなければ、その問の解説ファイルを消して skips に足す）
6. commit・push する（ユーザーの許可：2026-10-19。このループに限る）
   - `git add data/explanations data/review data/statutes pipeline/egov.py app/public/data NOW.md`
   - メッセージ：`解説：<最初の問>〜<最後の問>（N問・肢M、検査を通った肢 K）` ＋ Co-Authored-By の行
7. 5バッチごとに NOW.md の「解説の生成」の行（残りの問数・肢数、skips の数）を上書きする

## サブエージェントへの指示（そのまま渡す）

```
あなたは司法試験・予備試験の短答の過去問の解説を書く。リポジトリは /Users/user/work/other/law/tanto-app。
まず CLAUDE.md の禁止事項と prompts/explain-v2.md を読み、その指示どおりに、次の問の解説を1問ずつ書き出して検査を通す：
  <exam> <year> <subject> <number>（3問）
- 問の中身は python3 pipeline/explain_queue.py --show <exam> <year> <subject> <number> で表示する（リード文・前提文・小問・選択肢・肢と公式の○×）
- 書く肢は、その表示で「書く」とある肢だけ（名寄せ・解説済み・○×なしの肢は書かない）
- 条文は python3 pipeline/egov.py <法令> <条> で表示したものだけ引用する
- 書いたら python3 pipeline/check_explanations.py <exam> <year> <subject> <number> を通す。❌ は2回まで直す
- 書いてよいのは data/explanations/ の担当の問のファイルだけ。git の操作はしない
- 使ってよい道具は次だけ（人が見ていない間に動くので、許可の要る操作をすると止まってしまう）：
  ファイルの読み書きは Read・Write・Edit の道具／Bash は「python3 pipeline/explain_queue.py --show …」「python3 pipeline/egov.py …」「python3 pipeline/check_explanations.py …」だけ／判例の確認は WebSearch と、www.courts.go.jp の WebFetch だけ
  curl・その場で書く python・cat や grep などのコマンドは使わない（JSON は Read の道具で読む）
最後に、問ごとに1行で報告する：「<question_id>：検査 ✅ N肢／❌ M肢（理由の要約）／法令がない：<法令名>（あれば）」
```

## 注意

- ループで使う操作は `.claude/settings.local.json` で許可してある（2026-10-20 ユーザー了承）。それ以外の操作をメインもサブエージェントもしない
- サブエージェントは同じ法令ファイルを読むだけで、書くのは別々の解説ファイルなので、並行しても衝突しない。`LAWS` の追加と取得はメインだけが行う
- CI は `git diff --exit-code data/ app/public/data/ reports/` で作り直しの差分を見る。push の前に必ず 5 を通す
