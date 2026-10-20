# 誤り報告の処理の手順（T040）

> アプリの「誤りを報告」で送られた報告は、Cloudflare D1（`tantan`）の `reports` 表にたまる。通知はないので、Claude のセッションで見に行って処理する。

## 一覧を取る

```
cd app && npx wrangler d1 execute DB --remote --command "SELECT id, target, kind, body, context, created_at FROM reports WHERE status = 'open' ORDER BY created_at"
```

- `npx wrangler login` が要る（ユーザーの許可を得てから）
- `target` は肢 ID（`yobi-2024-minpo-q01-a`）か問 ID（`yobi-2024-minpo-q01`）。`context` に、見ていた解説の版（`prompt_version`・`generated_at`）が入る

## 種別ごとの扱い

| kind | 扱い |
|---|---|
| `explanation`（解説） | 解説を直し、`version` を上げて `check_explanations.py` を通す。条文・判例は、e-Gov・裁判所のページで確かめたものだけ（禁止事項4） |
| `truth`（○×） | **公式の○×は変えない**（禁止事項2）。パースの誤りか（PDF と見比べる）、法務省の正誤訂正・採点上の取扱いがあるか（T006 の手順）を調べる。出題後の法改正なら、解説に改正の注記を足す |
| `question`（問題文） | PDF（`data/raw/`）と見比べる。抽出の誤りならパイプラインを直す（テキスト層が正常な PDF に AI の補正はかけない：禁止事項3） |
| `other` | 内容を読んで判断する |

## 処理したら

```
cd app && npx wrangler d1 execute DB --remote --command "UPDATE reports SET status = 'done' WHERE id = '<報告 ID>'"
```

- 直さなかったもの（報告が誤り・対象外）は `status = 'wontfix'`
- 報告への返信はしない（返信の手段を持たない。プライバシーポリシーのとおり）
- 退会した人の報告は `user_id` が NULL になって残る
