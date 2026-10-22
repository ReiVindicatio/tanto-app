# 問の解説の指示（explain-question-v1）

> **この指示を変えたら版を上げる**（explain-question-v2.md を新しく作る。このファイルは編集しない）。T018。
> 肢ごとの○×が決まらない問（穴埋め・個数・区分・記述と結論の組合せなど。`statement_truth_derivable` が false の問）に、問ごとに1つ解説を書く。
> 条文・判例・旧法・前提文の扱いは **explain-v3 の「守ること」2〜9 をそのまま守る**（このファイルには、問の解説で違うところだけを書く）。

## 入力（1問ごと）

- `python3 pipeline/explain_queue.py --show <exam> <year> <subject> <number>` の表示：リード文・前提文・小問・選択肢・肢・**公式の正解（解答欄ごと）**
- **公式の正解は固定。**モデルが判定し直さない
- 条文：`python3 pipeline/egov.py <法令> <条>`（前文は `前文`、別表は `別表第一` など、条のない法令は `本則`）。判例：`python3 pipeline/courts.py`

## 書くもの

- 問の解説を1つ（`question_explanation`）。肢ごとの解説（`explanations`）は書かない
- **結論（conclusion）**：公式の正解を示し、それがなぜ正解かの決め手を1〜2文で（例：「正解は3（①ｂ・②ｄ・③ｆ）。過失犯の実行行為を結果に直近する行為に限る見解（ａ）に立つと…」）
- **本文（body）**：問の形に合わせて、正解にたどり着く筋道を書く。目安は 4〜10文
  - 穴埋め：空欄ごとに、入る語句とその理由（前後の文脈・条文の文言・判例）。紛らわしい語句がなぜ入らないかも短く
  - 個数・組合せ：記述ごとに正しいか誤りかと、その決め手。公式の正解から逆算した○×は「公式の正解（個数・組合せ）から、〜は誤りとなる」と書き、条文・判例で確かめられた理由と区別する
  - 区分（見解Ⅰ・Ⅱのどちらの立場か など）：記述ごとに、どの見解から導かれるかと、その理由
  - 解答欄が複数ある問は、解答欄ごとに分けて書く
- **stated_answer**：公式の正解を、`--show` の【公式の正解】の解答欄の順に整数で並べる（順不同の問はどの順でもよい）。書いている途中で「公式の正解は誤りではないか」と思ったら、曲げずに自分の答えを書き、`notes` に理由を書く（検査が食い違いとして止める）

## 守ること（explain-v3 に加えて）

1. **公式の正解に合わせる。**肢ごとの○×は公式に示されていない。記述ごとの○×を書くときは、条文・判例・問題文から言えることだけを書き、言えないことを断定しない（「公式の正解から〜となる」と書く）
2. 学説・見解の内容は、問題文（前提文・見解の説明）に書いてあることを根拠にする。問題文にない学説の名前・論者・沿革を記憶で足さない。一般的な理解を書くときは「〜と解されている」とし、`notes` に「解釈による」
3. 判例・条文・旧法の扱いは explain-v3 の規則2〜5・8 と同じ（記憶で条文・判例の日付を書かない。確かめられない判例は「判例あり（要確認）」と `pending_cases`。必要な法令がなければ書き出さずに「法令がない」と報告）

## 出力

`data/explanations/<exam>/<year>/<subject>/q<NN>.json`（NN は2桁）。ファイルがなければ作り、あれば `question_explanation` だけを足す（既存の `explanations` は残す）。

```json
{
  "question_id": "yobi-2026-keiho-q03",
  "prompt_version": "explain-v3",
  "generated_at": "YYYY-MM-DD",
  "generated_by": { "model": "<モデル ID>", "via": "Claude Code セッション（サブエージェント）" },
  "explanations": [],
  "question_explanation": {
    "prompt_version": "explain-question-v1",
    "generated_at": "YYYY-MM-DD",
    "generated_by": { "model": "<モデル ID>", "via": "Claude Code セッション（サブエージェント）" },
    "version": 1,
    "stated_answer": [3],
    "conclusion": "正解は3。決め手を1〜2文で",
    "body": "空欄ごと・記述ごとの説明。条文の文言は「」で引用（保存した本文と一致）",
    "citations": [ { "type": "statute", "law": "刑法", "article": "38", "paragraphs": ["1"], "quote": "保存した本文からそのまま" } ],
    "cases": [],
    "pending_cases": [],
    "notes": []
  }
}
```

- ファイルを新しく作るときの一番外の `prompt_version`・`generated_at`・`generated_by` は、肢の解説用の欄（空の `explanations` と一緒に置く。値は問の解説と同じでよい）
- `citations`・`cases`・`pending_cases` の形は explain-v3 と同じ
- 書き出したら `python3 pipeline/check_explanations.py <exam> <year> <subject> <NN>` を通す（「✅ <問 ID>（問の解説）」と出る）。❌ が出たら直して通し直す（2回まで）。食い違い（🔴）は直さずに報告する
