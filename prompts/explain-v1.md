# 解説生成の指示（explain-v1）

> **この指示を変えたら版を上げる**（explain-v2.md を新しく作る。このファイルは編集しない）。
> 生成は Claude Code のセッションで行う。1問（その問の肢すべて）ごとに1ファイル書き出し、チェックを通してから次の問へ進む。

## 入力（1問ごと）

- 正本 `data/questions/<exam>/<year>/<subject>.json` の、その問のリード文・前提文・肢
- **肢ごとの公式の○×（`truth_at_exam.value`）**：固定。モデルが判定し直さない
- 根拠条文の本文：`python3 pipeline/egov.py <法令> <条>` で取得し、`data/statutes/` に保存したもの

## 守ること

1. **結論は公式の○×に合わせる。**書いている途中で「公式の○×は誤りではないか」と思ったら、解説を曲げずに `stated_truth` に自分の結論を書き、`notes` に理由を書く。チェックが食い違いとして止める（パースの誤り・正答表の読み違い・法改正の信号）
2. **条文の文言は、`data/statutes/` に保存した本文からだけ引用する。**記憶で条文を書かない。本文中で条文を引くときは「」で囲み、保存した本文の文字列と一致させる（チェックが照合する）
3. **判例は、検索で確認できたものだけ載せる。**事件の呼び名・裁判所・年月日・確認した URL を `cases` に書く。確認できないときは本文に「判例あり（要確認）」とだけ書き、`cases` には入れない
4. **条文に書いていない解釈（学説・判例の一般的な理解）を書くときは、そうと分かる書き方にする**（「〜と解されている」）。必要なら `notes` に「解釈による」と残す
5. e-Gov の本文は**取得日時点の現行法**。出題時点から改正がありうる年度では、改正の有無を確認し、`notes` に書く
6. 問題文にない事実を足さない。肢の結論を分けるポイント（どの文言が誤りか）を最初に示す

## 出力

`data/explanations/<exam>/<year>/<subject>/q<NN>.json`

```json
{
  "question_id": "yobi-2026-minpo-q01",
  "prompt_version": "explain-v1",
  "generated_at": "YYYY-MM-DD",
  "generated_by": { "model": "<モデル ID>", "via": "Claude Code セッション" },
  "explanations": [
    {
      "target": { "type": "statement", "id": "yobi-2026-minpo-q01-a" },
      "version": 1,
      "stated_truth": true,
      "conclusion": "1文で：○か×か＋決め手",
      "body": "3〜6文。条文の文言は「」で引用（保存した本文と一致）",
      "citations": [
        { "type": "statute", "law": "民法", "article": "5", "paragraphs": ["1"], "quote": "保存した本文からそのまま抜き出した文" }
      ],
      "cases": [],
      "notes": []
    }
  ]
}
```

- `article` は e-Gov の形（枝番は `98_2`）。`paragraphs` は項の番号（1始まり）
- `quote` は、その項の本文の部分文字列であること
- 書き出したら `python3 pipeline/check_explanations.py <exam> <year> <subject> <NN>` を通す。食い違い・照合失敗があれば公開対象から外れ、`NOW.md` に残す
