# 解説の連続生成の手順（メインのセッション用。T039・決定021）

> `/loop` で回す。1回の起動で、下の「1回分」を時間とトークンの許す限りくり返す。止まっても、次の起動で続きから再開できる（進み具合はファイルとキューが持つ）。

## 1回分（バッチ）

1. `git status --short` で、前のバッチの書きかけが残っていないか見る。残っていれば、その問の `check_explanations.py` を通し直してから 4 へ
2. `python3 pipeline/explain_queue.py --next 18` で次の18問を取る（前のバッチの `explain_commit.py` の表示にも出ている）。0問なら終わり（NOW.md に「解説の生成キューが空」と書いて `explain_commit.py` で commit・push し、`/loop` を止める）
   - **前のバッチの `explain_commit.py` が「⏸ 上限の目安に達した：HH:MM まで待って」と表示したら、その時刻まで `ScheduleWakeup`（最大3600秒をくり返す）で待ってから 2 に進む**（2026-10-20 ユーザー指示：利用上限の10%は残す。1バッチで約4%。枠の数え方は `.claude/explain_window.json`）
3. **サブエージェントを6本、同じメッセージで並行して起動する**（`run_in_background: true`）。1本に3問ずつ渡す。渡す内容は「サブエージェントへの指示」（下）
   - 起動したら `ScheduleWakeup`（600秒）で待つ。戻った知らせ（task-notification）で起こされる
   - **起動から20分を超えて戻らない1本は `TaskStop` で打ち切る**（許可待ちで止まっている可能性がある。2026-10-20、1本が許可待ちのまま約11時間止まり、全体が止まった）。打ち切った問は解説ファイルが不完全でも検査で落ちる肢は公開されず、ファイルのない問はキューに残るので次のバッチで作り直される
   **メインのセッションも、許可していない操作をしない**：ヒアドキュメント・`&&` でつないだ複合コマンド・その場で書く python は、許可の設定に当たらず承認待ちで止まる（2026-10-20、これで何度も止まった）。バッチの後始末は 4〜7 をまとめた `python3 pipeline/explain_commit.py [--skip <question_id> "<理由>"]…` の1コマンドだけで行う。法令を足すときは `pipeline/egov.py` を Edit の道具で直し、`python3 pipeline/egov.py --fetch <法令>` を単独で実行する
4. 全部が戻ったか打ち切ったら：
   - 「法令がない」と報告された法令は、`pipeline/egov.py` の `LAWS` に Edit の道具で足し、`python3 pipeline/egov.py --fetch <法令>` を単独で実行する（法令番号は e-Gov の法令名の照合で確かめる。取れなければ足さない）。その問はキューに残るので、次のバッチで作られる
   - 2回直しても検査に通らない問・食い違い（🔴）が出た問・e-Gov にない規則（刑事訴訟規則など）で決まる問は、5 の `--skip` で skips に足す（キューから外れる）
5. **`python3 pipeline/explain_commit.py [--skip <question_id> "<理由>"]…` を実行する。後始末はこの1コマンドだけ**（skips への追加・作り直し・NOW.md の更新・commit・push・次の9問の表示）。失敗したら原因を直す。直せなければ、その問の解説ファイルを消して `--skip` を付けて流し直す
   - **単独の `git add`・`git commit`・`git push` は実行しない**（2026-10-20：許可の一覧に入れても単独の `git push` は承認待ちになった。`explain_commit.py` の中の push は承認なしで通ることを確認済み）
   - commit・push はユーザーの許可（2026-10-19。このループに限る）

## サブエージェントへの指示（そのまま渡す）

```
あなたは司法試験・予備試験の短答の過去問の解説を書く。リポジトリは作業ディレクトリ（このリポジトリの一番上）。
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
- 判例は WebSearch で「<事件名や判示の語句> 最高裁 courts.go.jp」と探し、判決の番号（hanrei/<id>）が分かれば判決のページ https://www.courts.go.jp/hanrei/<id>/detail2/index.html を WebFetch で開いて確かめる（旧形式の URL は 404）。裁判所の検索ページ search1 は JavaScript で描くので WebFetch では結果が出ない（2026-10-20 確認）。1つの判例を探すのは2回まで、見つからなければ「判例あり（要確認）」。探さなかった判例は notes に「探していない」と書く（「確認できなかった」と書かない。2026-10-20、探していないのに「確認できなかった」と書いた例があった）。判決の日付などを記憶で書かない。予備校・解説サイトの内容は使わない
- 借地借家法・会社法施行規則・手形法（附則82条まで）・小切手法・行政法の各法・労働組合法なども保存済み。刑事訴訟規則・民事訴訟規則は e-Gov になく使えない
- 法令が保存済みかは、思い込まずに python3 pipeline/egov.py <正式な法令名> <条> を実行して確かめる（ないときだけエラーになる。2026-10-20、保存済みの道路交通法を「ない」として引用しなかった例が続いた）
最後に、問ごとに1行で報告する：「<question_id>：検査 ✅ N肢／❌ M肢（理由の要約）／法令がない：<法令名>（あれば）」
```

## 注意

- ループで使う操作は `.claude/settings.local.json` で許可してある（2026-10-20 ユーザー了承）。それ以外の操作をメインもサブエージェントもしない
- サブエージェントは同じ法令ファイルを読むだけで、書くのは別々の解説ファイルなので、並行しても衝突しない。`LAWS` の追加と取得はメインだけが行う
- CI は `git diff --exit-code data/ app/public/data/ reports/` で作り直しの差分を見る。push の前に必ず 5 を通す
