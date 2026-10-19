# 解説の連続生成の手順（メインのセッション用。T039・決定021）

> `/loop` で回す。1回の起動で、下の「1回分」を時間とトークンの許す限りくり返す。止まっても、次の起動で続きから再開できる（進み具合はファイルとキューが持つ）。

## 1回分（バッチ）

1. `git status --short` で、前のバッチの書きかけが残っていないか見る。残っていれば、その問の `check_explanations.py` を通し直してから 4 へ
2. `python3 pipeline/explain_queue.py --next 9` で次の9問を取る。0問なら終わり（NOW.md に「解説の生成キューが空」と書いて commit・push し、`/loop` を止める）
3. **サブエージェントを3本、同じメッセージで並行して起動する**（`run_in_background: false`）。1本に3問ずつ渡す。渡す内容は「サブエージェントへの指示」（下）
4. 全部が戻ったら：
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
- 問の中身は data/questions/<exam>/<year>/<subject>.json から読む（その問の stem・context・sub_questions・statements）
- 書く肢は、truth_at_exam があり、app/public/data/index.json の aliases のキーにない肢だけ
- 条文は python3 pipeline/egov.py <法令> <条> で表示したものだけ引用する
- 書いたら python3 pipeline/check_explanations.py <exam> <year> <subject> <number> を通す。❌ は2回まで直す
- 書いてよいのは data/explanations/ の担当の問のファイルだけ。git の操作はしない
最後に、問ごとに1行で報告する：「<question_id>：検査 ✅ N肢／❌ M肢（理由の要約）／法令がない：<法令名>（あれば）」
```

## 注意

- サブエージェントは同じ法令ファイルを読むだけで、書くのは別々の解説ファイルなので、並行しても衝突しない。`LAWS` の追加と取得はメインだけが行う
- CI は `git diff --exit-code data/ app/public/data/ reports/` で作り直しの差分を見る。push の前に必ず 5 を通す
