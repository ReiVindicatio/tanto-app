# 解説の連続生成・判例の確かめ直しの手順（メインのセッション用。T039・T041・決定021・022）

> `/loop` で回す。1回の起動で、下の「1回分」を時間とトークンの許す限りくり返す。止まっても、次の起動で続きから再開できる（進み具合はファイルとキューが持つ）。
> **次のバッチが「解説の生成」か「判例の確かめ直し」かは `explain_commit.py` が決めて `.claude/current_batch.json` に書く**（① 第三者サイトの判例が残っている間は確かめ直し、それ以後は交互）。メインはその表示に従うだけ。

## 止まらないための決まり（2026-10-20〜21 に止まった原因から）

| 止まった原因 | 決まり |
|---|---|
| サブエージェントが許可の要るコマンドを使い、承認待ちのまま約11時間止まった | サブエージェントは**専用の種類**（`explain-writer`・`case-rechecker`。`.claude/agents/`）で起動する。使える道具は Read・Write・Edit・Bash だけで、Bash で使ってよいコマンドは定義に書いてある。起動の文には問の一覧だけを書く |
| 止まったサブエージェントに気づけなかった | 起こされるたびに `python3 pipeline/batch_status.py` を実行する。「⏰ 動きがない」と出たら、戻っていない1本を `TaskStop` で打ち切って後始末へ進む |
| メインがヒアドキュメント・`&&`・その場で書く python・単独の `git push` を使い、承認待ちで止まった | メインが使うコマンドは、`python3 pipeline/explain_commit.py …`・`python3 pipeline/batch_status.py …`・`python3 pipeline/egov.py …`・`python3 pipeline/case_queue.py`・`python3 pipeline/explain_queue.py` の**単独のコマンドだけ**。git は `explain_commit.py` の中だけ |
| サブエージェントを同時に起動したら判定が返らなかった | **1本ずつ起動する**（6回に分けて Agent を呼ぶ） |
| `explain_commit.py` が10分の制限を超えた（作り直しに約3分＋push。Mac が遅いと超える） | `explain_commit.py` は**必ず `run_in_background: true` で実行し**、終わった知らせを待つ |
| Mac がスリープして止まった（06:57〜07:31） | 蓋を開けて電源につないでおく（ユーザーにお願いしている）。`caffeinate -is` を起動しておく（蓋を閉じると効かない） |

## 1回分（バッチ）

1. 前のバッチの `explain_commit.py` の表示（または `python3 pipeline/batch_status.py`）で、次のバッチの種類と18問を見る
   - 「⏸ 上限の目安に達した：HH:MM まで待って」と出ていたら、その時刻まで `ScheduleWakeup`（最大3600秒をくり返す）で待つ（2026-10-20 ユーザー指示：利用上限の10%は残す。枠の数え方は `.claude/explain_window.json`）
   - 「🏁 キューがどちらも空」と出たら終わり（NOW.md を直して `explain_commit.py` で commit・push し、`/loop` を止める）
2. **サブエージェントを6本、1本ずつ起動する**（`run_in_background: true`、1本に3問）。種類は表示のとおり：解説の生成は `subagent_type: "explain-writer"`、確かめ直しは `subagent_type: "case-rechecker"`。起動の文は次の形だけ：
   ```
   次の3問を担当する（今日は YYYY-MM-DD）：
     <exam> <year> <subject> <number>
     <exam> <year> <subject> <number>
     <exam> <year> <subject> <number>
   ```
   - 専用の種類が使えない（一覧にない）ときは、`general-purpose` で起動し、文の最初に「まず .claude/agents/explain-writer.md（または case-rechecker.md）を Read の道具で読み、その指示どおりに動く」と書く
   - 6本とも起動したら `python3 pipeline/batch_status.py --start` を実行し、`ScheduleWakeup`（1200秒）で待つ。戻った知らせ（task-notification）で起こされる
3. 起こされるたびに：
   - サブエージェントの報告を読み、「法令がない」は `pipeline/egov.py` の `LAWS` に Edit の道具で足して `python3 pipeline/egov.py --fetch <法令>` を単独で実行する（法令番号は e-Gov の法令名の照合で確かめる。取れなければ足さない）
   - 報告に記憶で書いた中身・検索結果の要約から書いた中身があれば、その箇所を本文から外して `check_explanations.py` を通し直す（2026-10-21 に2件あった）
   - `python3 pipeline/batch_status.py` を実行する。「⏰」なら、戻っていない1本を `TaskStop` で打ち切る
   - まだ戻っていない1本があれば、`ScheduleWakeup`（1200秒）で待つ
4. 全部が戻ったか打ち切ったら、**`python3 pipeline/explain_commit.py [--skip …] [--skip-recheck …]` を `run_in_background: true` で実行する。後始末はこの1コマンドだけ**（skips への追加・作り直し・NOW.md の更新・commit・push・次のバッチの決定と表示）
   - `--skip <question_id> "<理由>"`：解説の生成で、2回直しても検査に通らない問・食い違い（🔴）が出た問・e-Gov にない規則（刑事訴訟規則など）で決まる肢を含む問（書いた肢があっても付ける。付けないと残りの肢がまた出る）
   - `--skip-recheck <question_id> "<理由>"`：確かめ直しで、判決と公式の○×が合わないと報告された問（解説は直さない。禁止事項2）
   - 失敗したら原因を直す。直せなければ、その問の解説ファイルを `git` で戻さずに、`--skip` を付けて流し直す
   - commit・push はユーザーの許可（2026-10-19。このループに限る）
5. 1 に戻る

## 参考：サブエージェントへの指示の全文（解説の生成）

> ふだんは `.claude/agents/explain-writer.md` が同じ内容を持つので、起動の文には問の一覧だけを書く。これは定義が使えないときの控え。

```
あなたは司法試験・予備試験の短答の過去問の解説を書く。リポジトリは作業ディレクトリ（このリポジトリの一番上）。
まず CLAUDE.md の禁止事項と prompts/explain-v5.md を読み（Read の道具で）、その指示どおりに、次の問の解説を1問ずつ書き出して検査を通す：
  <exam> <year> <subject> <number>（3問）
- 問の中身は python3 pipeline/explain_queue.py --show <exam> <year> <subject> <number> で表示する（リード文・前提文・小問・選択肢・肢と公式の○×）
- 書く肢は、その表示で「書く」とある肢だけ（名寄せ・解説済み・○×なしの肢は書かない）
- 条文は python3 pipeline/egov.py <正式な法令名> <条> で表示したものだけ引用する。法令が保存済みかは、思い込まずにこのコマンドを実行して確かめる（ないときだけエラーになる）。刑事訴訟規則・民事訴訟規則・大日本帝国憲法は e-Gov になく使えない。日本国憲法の前文は egov.py で取り出せない
- 判例は python3 pipeline/courts.py search／show／pdf で裁判所の判決のページを確かめたものだけ載せる（explain-v5 の規則3）。確かめられなければ本文に「判例あり（要確認）」と書き、pending_cases に残す。WebSearch・解説サイト・検索結果の要約は判例の確かめに使わない
- 出題当時の旧法（改正前）の文言・数字・条番号の中身を記憶で書かない。現行法の e-Gov の本文で説明し、改正で変わった点は「改正前の内容は条文の本文で確認していない」と notes に書く
- 問題文に参照条文として載っている法令の中身は、その問題文を根拠にしてよい
- 民法の2019年以前の問は explain-v5 の「民法の2019年以前の問」に従う（今の条文で公式の○×を説明できない肢・前提の規律がなくなった肢は、解説を書かずに law_changed に理由（名前だけ変わって規律と結論が同じなら解説を書く）。検査で ⚖️ と出れば正しい。H29〜R01 は python3 pipeline/egov.py 民法 <条> --asof <年>-05-01 で出題時点の本文を読める。引用はしない）
- 書いたら python3 pipeline/check_explanations.py <exam> <year> <subject> <number> を通す。❌ は2回まで直す
- 書いてよいのは data/explanations/ の担当の問のファイルだけ。git の操作はしない
- 使ってよい道具は次だけ（人が見ていない間に動くので、許可の要る操作をすると止まってしまう）：
  ファイルの読み書きは Read・Write・Edit の道具／Bash は「python3 pipeline/explain_queue.py --show …」「python3 pipeline/egov.py …」「python3 pipeline/courts.py …」「python3 pipeline/check_explanations.py …」の単独のコマンドだけ（&& やパイプでつながない。ls・cat・grep・curl・その場で書く python も使わない。ファイルがあるかは Read で確かめる）
- generated_by.model は実行しているモデルの ID、generated_at は今日の日付
最後に、問ごとに1行で報告する：「<question_id>：検査 ✅ N肢／⚖️ L肢（law_changed）／❌ M肢（理由の要約）／判例 確かめた N件・要確認 M件／法令がない：<法令名>（あれば）」。記憶で書いた箇所が残っていればそれも報告する。許可を求められて止まった操作があれば、そのコマンドも報告する
```

（2026-10-20〜21 の運用で足した注意：探していない判例を「確認できなかった」と書かない／保存済みの法令を「ない」と思い込まない／旧商法の利率を記憶で書いた例／検索結果の要約から判例の理由づけを書いた例。explain-v3 と上の指示に織り込み済み）

## 問の解説（T018）

「1回分」と同じ回し方で、肢の解説と確かめ直しのキューが空になったあと、`explain_commit.py` が問の解説のバッチ（「問の解説（サブエージェント explain-question-writer）」）を出す。キューは `python3 pipeline/explain_queue.py --questions`、指示は `prompts/explain-question-v1.md`。サブエージェントは `subagent_type: "explain-question-writer"`（一覧にないときは `general-purpose` に `.claude/agents/explain-question-writer.md` を読ませる）。報告の「🔴 公式の正解と食い違う」は直さずに `--skip <問 ID> "<理由>"` を付けて後始末する。

## 判例の確かめ直し（T041）

「1回分」と同じ回し方で、`explain_commit.py` が確かめ直しのバッチを出したときに回す（キューは `python3 pipeline/case_queue.py`）。利用上限の枠は解説の生成と共通。

参考：サブエージェントへの指示の全文（ふだんは `.claude/agents/case-rechecker.md` が持つ。定義が使えないときの控え）：

```
あなたは司法試験・予備試験の短答の過去問の解説の、判例を確かめ直す。リポジトリは作業ディレクトリ（このリポジトリの一番上）。
まず CLAUDE.md の禁止事項と prompts/case-recheck-v1.md を読み（Read の道具で）、その指示どおりに、次の問の解説ファイルを1問ずつ直して検査を通す：
  <exam> <year> <subject> <number>（3問）
- 解説ファイルは data/explanations/<exam>/<year>/<subject>/q<NN>.json（NN は2桁）。Read の道具で読む
- 判例は python3 pipeline/courts.py search／show／pdf だけで確かめる。WebSearch・WebFetch・解説サイト・検索結果の要約は使わない
- 公式の○×には触れない。確かめた判決が肢の結論と合わないときは、直さずに報告して止める
- 書いたら python3 pipeline/check_explanations.py <exam> <year> <subject> <number> を通す。❌ は2回まで直す
- 書いてよいのは担当の問の解説ファイルだけ。git の操作はしない
- 使ってよい道具は次だけ：ファイルの読み書きは Read・Write・Edit の道具／Bash は「python3 pipeline/courts.py …」「python3 pipeline/egov.py …」「python3 pipeline/check_explanations.py …」の単独のコマンドだけ（&& やパイプでつながない。ls・cat・grep・curl・その場で書く python も使わない）
最後に、問ごとに1行で報告する：「<question_id>：確かめた N件／要確認に残した M件（大審院 K件）／外した判例 L件／検査 ✅ or ❌（理由）」。許可を求められて止まった操作があれば、そのコマンドも報告する
```

## 注意

- ループで使う操作は `.claude/settings.local.json` で許可してある（2026-10-20 ユーザー了承）。それ以外の操作をメインもサブエージェントもしない
- サブエージェントは同じ法令ファイルを読むだけで、書くのは別々の解説ファイルなので、並行しても衝突しない。`LAWS` の追加と取得はメインだけが行う
- CI は `git diff --exit-code data/ app/public/data/ reports/` で作り直しの差分を見る。push の前に必ず 4（explain_commit.py）を通す
