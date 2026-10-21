# T041 解説の判例の確かめ直し

- 状態：実装中（道具・検査・指示書は実装レビュー OK：2026-10-21。確かめ直しを `/loop` で回している）
- マイルストーン：M3 公開
- 優先度：**高**
- 依存：T039（解説の連続生成）
- 更新：2026-10-21

## 目的・背景

解説の判例の扱いが、公開したときに一番危うい。2026-10-21 時点の数字（肢の解説 4,650件）：

| | 件数 | 割合 |
|---|---|---|
| 本文に「判例あり（要確認）」がある解説 | 637 | 14% |
| `cases` に判例が入っている解説 | 997（判例 1,037件） | 21% |
| 本文に「〜と解されている」がある解説（条文にない解釈） | 2,156 | 46% |

科目別の「要確認」：刑法 203/646・民訴 162/1,008・行政 77/550・憲法 73/447・商法 63/963・刑訴 35/511・民法 24/525。

**🔴 見つかった問題：第三者のサイトで「確認済み」にした判例がある。**
`verified_urls` の内訳は、courts.go.jp の判決のページ 950・判決全文の PDF 202・**law-lib.jp 90・takken-success.info 2**。law-lib.jp などの URL があるのは民法 R02〜R08 の42問（`explain-v1`、2026-10-18〜19 生成。T012）。判例の要旨を第三者のサイトで確かめたもので、禁止事項1（法務省の公開資料以外を素材にしない）・4（判例は検索で確認できたものだけ）に反する疑いがある。検査（`check_explanations.py`）は `verified_urls` の中身（どのサイトか）を見ていない。

「要確認」が多い原因（T039 の運用で分かったこと）：
- 裁判所の裁判例検索のページ（search1）は JavaScript で描くので、WebFetch では結果が読めない
- そのため WebSearch で判決のページ（hanrei/<id>）を探しているが、古い判決・大審院の判決・決定はヒットしにくい
- 1つの判例を探すのは2回までにしている（解説の生成を止めないため）

## 議論（選択肢と勧め）

### 1. 範囲

| | 中身 | 勧め |
|---|---|---|
| A | law-lib.jp などで確かめた判例（42問）を、courts.go.jp で確かめ直す。確かめられなければ `cases` から外し、本文を「判例あり（要確認）」にする | **必須。最初にやる** |
| B | 「判例あり（要確認）」の637件を、時間をかけて探し直す | **やる** |
| C | 「〜と解されている」の2,156件 | **今回はやらない**（判例の確認とは別の問題で、量も多い。B で判例が見つかれば一部は自然に裏付けが付く） |

### 2. 確かめ方

- まず**下調べ（半日以内）**：裁判例検索のページが裏で呼んでいる通信を調べ、事件番号や年月日で判決のページを直接引ける形があるか確かめる。あれば「要確認」の大半はこれで片付く見込み。なければ、今と同じ WebSearch → 判決のページの形で、探す回数の上限を上げて回す
- 判決のページの判示事項・裁判要旨で足りないときは、判決全文の PDF を読む（今と同じ）
- 予備校・解説サイト・検索結果の要約は使わない（今と同じ）

### 3. データの形（スキーマの変更。合意が要る）

いまは「要確認」が本文の文字列にしかなく、数えるのも直すのも文字列頼み。次のどちらかにしたい：

- **案1（勧め）**：解説に `pending_cases` を足す。`[{"about": "何についての判例か（肢の論点）", "searched": 2}]`。本文の「判例あり（要確認）」はそのまま残す。確かめられたら `cases` に移して本文を直す
- 案2：形は変えず、本文の文字列で数える（今のまま）

### 4. 検査を強める（方針の変更。合意が要る）

- `verified_urls` は `https://www.courts.go.jp/` で始まるものだけを認める（それ以外は ❌）
- これを入れると、民法の42問は直すまで公開から外れる。外れるのが嫌なら、直し終えてから入れる

### 5. 進め方

- T039 と同じく、サブエージェントで並行して回す（問のファイル単位で分けるので、解説の生成と同じファイルを触らない）
- 判例を確かめて本文を直すときは、解説の版（`version`）を上げ、`notes` に確かめ直したことを残す
- 公式の○×（`truth_at_exam`）には触れない。確かめた判例が肢の結論と合わないときは、解説を直さずにフラグを立てて止める（禁止事項2）

### 決まったこと（2026-10-21 ユーザー）

- 範囲：A（第三者サイトで確かめた42問）＋ B（要確認 637件）。C（「解されている」）は今回はやらない
- データ：`pending_cases` を足す
- 検査：`verified_urls` を courts.go.jp だけに絞るのは、42問を直し終えてから入れる

## 下調べの結果（2026-10-21）

- 裁判例検索は、**検索語・日付を URL に付けて GET すると、サーバーが結果の一覧を HTML で返す**（JavaScript は要らない）。WebFetch で読めなかったのは、検索語を付けずに開いていたため
  - 最高裁判例：`https://www.courts.go.jp/hanrei/search2/index.html?query1=<語>&filter[judgeGengoFrom]=昭和&filter[judgeYearFrom]=47&filter[judgeMonthFrom]=11&filter[judgeDayFrom]=16&…To…`（例：「留置権」＋昭和47年11月16日 → 1件、hanrei/52639）
  - 全部の裁判例：`search1`（同じ形）
  - 一覧の各行に、判決のページ（`hanrei/<id>/detail<N>`）・事件番号・事件名・裁判年月日・法廷・種別・全文 PDF がある
- 判決のページ（detail2）からは、事件番号・事件名・裁判年月日・法廷名・裁判種別・結果・判例集・**判示事項・裁判要旨**・参照法条が、タグを外すだけで取り出せる
- robots.txt は `/hanrei/` を禁じていない。ブラウザの User-Agent でなくても 200 が返る
- 年号の選択肢は昭和・平成・令和だけ。**大審院の判決（明治・大正・昭和初期）はこのデータベースにない**とみられる → 大審院の判例は「要確認」のまま残る見込み

## 設計

### 1. 判例の検索・表示の道具 `pipeline/courts.py`（新規、標準ライブラリだけ）

```
python3 pipeline/courts.py search 留置権 引換給付 --date 昭和47-11-16   # 最高裁判例を検索（--all で全部の裁判例、--from/--to で期間）
python3 pipeline/courts.py show 52639                                    # 判決のページの項目（判示事項・裁判要旨など）と URL
python3 pipeline/courts.py pdf 52639                                     # 判決全文の PDF を取ってきて保存先を表示（Read の道具で読む）
```

- 出力は、確かめに使う URL（`https://www.courts.go.jp/hanrei/<id>/detail2/index.html`）をそのまま載せる。サブエージェントはその URL を `verified_urls` に書く
- 取ってきたページ・PDF は `.cache/courts/` に置き（git で管理しない）、同じものを二度取らない。取得の間は1秒あける
- User-Agent は道具の名前（`tanto-app-casecheck`）
- **WebSearch は判例の確かめに使わなくなる**（検索結果の要約が素材に混じる危うさもなくなる）

### 2. データ：`pending_cases`（スキーマの追加）

肢の解説に任意の項目を足す：

```json
"pending_cases": [
  {"about": "何についての判例か（肢の論点を短く）", "searched": ["courts.py search 留置権 第三者 --from 昭和40 --to 昭和50"]}
]
```

- 本文に「判例あり（要確認）」があるときは `pending_cases` が1件以上、ないときは空（検査で突き合わせる）
- `searched` には試した検索を残す（次に探す人が同じことをくり返さない）
- 確かめられたら `cases` に移し、本文を直して `pending_cases` から消す
- 画面には出さない（本文の「判例あり（要確認）」の表記は今のまま）

### 3. 検査（`pipeline/check_explanations.py`）

- 追加1（すぐ）：本文の「要確認」と `pending_cases` の突き合わせ。ただし、**今ある解説で `pending_cases` がないものは、確かめ直しが済むまで ⚠（警告）にとどめて公開は止めない**。新しく書く解説（explain-v3 以降）は ❌
- 追加2（42問を直し終えてから）：`verified_urls` は `https://www.courts.go.jp/` で始まるものだけ。それ以外は ❌

### 4. 解説の生成の指示を上げる：`prompts/explain-v3.md`

- 判例は `courts.py` で探して確かめる（WebSearch は使わない）。探すのは1つの判例につき検索3回まで
- 確かめられなければ `pending_cases` に残す
- T039 の残り（767問）は v3 で書く。`prompts/explain-runbook.md` もこれに合わせて直す

### 5. 確かめ直しの回し方

- `pipeline/case_queue.py`（新規）：確かめ直しが要る問を出す。順は ① `verified_urls` に courts.go.jp 以外がある問（42問）→ ② 本文に「要確認」があり `pending_cases` がない問（科目・年度の順）
- `prompts/case-recheck-v1.md`（新規）：サブエージェントへの指示。1問ずつ、その問の解説ファイルを開き、
  - ① の問：第三者サイトで確かめた判例を `courts.py` で確かめ直す。確かめられたら `verified_urls` を courts.go.jp の URL に替え、判示の要約を判決のページの文に合わせる。確かめられなければ `cases` から外し、本文を「判例あり（要確認）」にして `pending_cases` に入れる
  - ② の問：本文の「要確認」の判例を `courts.py` で探す。見つかれば `cases` に入れて本文を直し、見つからなければ `pending_cases`（試した検索つき）を書く
  - 直した解説は `version` を上げ、`notes` に「判例を確かめ直した（T041・日付）」と残す
  - 確かめた判例が肢の結論（公式の○×）と合わないときは、**解説を直さずに報告して止める**（禁止事項2）
- 後始末は T039 と同じく1コマンド（`pipeline/explain_commit.py` に `--recheck` の形を足すか、同じ作りの別の小さなスクリプト）で、検査・作り直し・commit・push
- T039 の連続生成と同じ枠を使うので、交互に回す（どちらを先にするかは都度決める）

### 6. 許可の設定（ユーザーの了承が要る）

- `.claude/settings.local.json` に `Bash(python3 pipeline/courts.py:*)` と `Bash(python3 pipeline/case_queue.py:*)` を足す（サブエージェントが承認待ちで止まらないように）

### 影響範囲

- 新規：`pipeline/courts.py`・`pipeline/case_queue.py`・`prompts/explain-v3.md`・`prompts/case-recheck-v1.md`・`docs/decisions/022-…`
- 変更：`pipeline/check_explanations.py`・`prompts/explain-runbook.md`・`.gitignore`（`.cache/`）・解説のファイル（確かめ直しの結果）
- アプリ（`app/`）は変えない（`pending_cases` は書き出しに含めない）

### テスト

- `courts.py`：検索結果・判決のページの HTML を `tests/fixtures/` に保存して、取り出し（id・事件番号・年月日・判示事項・裁判要旨）を単体テストする。通信はテストでしない
- `check_explanations.py`：「要確認」と `pending_cases` の突き合わせ、courts.go.jp 以外の URL の扱いを単体テストする
- パイプラインの回帰（今の解説で ❌ が増えないこと）

## 実装（2026-10-21）

- `pipeline/courts.py`・`pipeline/case_queue.py`・`pipeline/tests/test_courts.py`（＋ courts.go.jp のページの抜粋 `pipeline/tests/fixtures/courts/`）
- `pipeline/check_explanations.py`：検査7（要確認と `pending_cases`）・8（courts.go.jp 以外の URL。`STRICT_CASE_URLS = False` の間は ⚠）。⚠ は表示だけで、ファイルには書かない
- `pipeline/explain_commit.py --recheck`：確かめ直しのバッチの後始末。NOW.md に「判例の確かめ直し」の行を足す
- `prompts/explain-v3.md`・`prompts/case-recheck-v1.md`・`prompts/explain-runbook.md`（v3 に切り替え・確かめ直しの回し方）
- `docs/decisions/022-case-verification.md`・CLAUDE.md に1行・`.claude/settings.local.json`（`courts.py`・`case_queue.py` を許可）・`.gitignore`（`.cache/`）
- 設計からの追加：`cases` に任意の `case_number`（事件番号）。アプリへの書き出しには含めない
- 「判例あり（要確認）」の数え直し：表記どおりの「判例あり（要確認）」は 627件（それ以外の「要確認」10件は法改正の注記など）

### 試し（① の3問：予備 R08 民法 q02〜q04）

- サブエージェント1本で、3問とも courts.go.jp の判決のページで確かめられた（law-lib.jp の URL を判決のページに置き換え、判示の言い回しを判決全文に合わせた）。🔴 なし・承認待ちで止まった操作なし・約2分
- 分かったことを指示書に入れた：`--date` に和暦（「昭和57年6月8日」）を渡せるようにした／`name` は何の判例か分かる呼び名（`show` の「事件名」は使わない）／`date` は西暦・`case_number` を書く／古い `verification` 項目は消す／検索は判示事項の表記を1〜2語＋日付で絞るほうが当たる（条番号は漢数字）
- 試しの3問の `name` は、上の決まりに合わせて元の呼び名に戻した

### テスト

- パイプラインの単体テスト 28件・回帰（作り直して差分は試しの3問の解説と、その書き出しだけ）・アプリの単体テスト 78件・E2E 26件

## 完了条件

- `courts.py`・`case_queue.py`・`explain-v3`・`case-recheck-v1` ができ、テストが通る
- ① の42問を直し終え、`verified_urls` に courts.go.jp 以外が0件。検査の追加2を入れる
- ② の要確認がすべて「確かめた（`cases`）」か「`pending_cases` に残した」のどちらかになり、検査の追加1を ⚠ から ❌ に上げる
- 確かめ直しの結果（確かめられた件数・残った件数・大審院など データベースにない判例の件数）をこのチケットに書く
- `docs/features.md` を更新する

## 止まらないための仕組み（2026-10-21。ユーザー：「何回も止まってるからちゃんと動くようにしてね」）

- サブエージェントの専用の種類 `.claude/agents/explain-writer.md`・`.claude/agents/case-rechecker.md`（使える道具を Read・Write・Edit・Bash に絞り、Bash で使ってよいコマンドを定義に書いた。起動の文は問の一覧だけ）
- `pipeline/batch_status.py`：バッチの進み具合と、25分動きがないときの打ち切りの目安
- `pipeline/explain_commit.py`：次のバッチ（解説の生成／確かめ直し）を決めて `.claude/current_batch.json` に書く。`--skip-recheck`（`data/review/recheck_skips.json`）
- `prompts/explain-runbook.md`：止まった原因ごとの決まり（1本ずつ起動・`explain_commit.py` は裏で実行・起こされるたびに `batch_status.py`）
