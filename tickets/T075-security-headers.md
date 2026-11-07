# T075 セキュリティの基本のヘッダー

- 状態：完了
- マイルストーン：M3 公開
- 優先度：中
- 依存：なし
- 更新：2026-11-07

## 目的・背景

2026-11-07 のセキュリティの点検（ユーザーの依頼）で、本番の応答にセキュリティのヘッダーが1つもないと分かった。他のサイトの枠に埋め込んで操作を誘導する（クリックジャッキング）などへの備えがない。

点検で問題がなかったもの：公開リポジトリと履歴に秘密の鍵はない（`.secrets/` は対象外、commit の作者は GitHub の匿名アドレス）。公開している Firebase の鍵では Gemini・Vertex・音声合成を呼べない（試して拒否された。生成に使うプロジェクトとも別）。ID トークンの検証、テスト用ログインは本番で止まる、SQL は値を埋め込まない、入力の検査、使いすぎの制限。課金衣装は通行証なしで 403、`../` で控えのファイルに届かない。`npm audit` は0件。CI は秘密を使わない。

ほかに伝えたこと（コードでは直さない）：URL の `reivindicatio0321` が Gmail のアドレスの前半と同じで、アドレスを推測されうる（ユーザーは URL をこのままにすると決めた。2段階認証を勧めた）。Firebase の鍵の使い道を Google Cloud のコンソールで絞っておくと安心（ユーザーの操作）。

## 議論（決まったこと）

設計レビュー省略（データ・スキーマ・方針に触れない。応答のヘッダーを足すだけ）。CSP（読み込める場所の制限）は、ログイン（Firebase）と閲覧の集計（Cloudflare）を壊さないよう調べてから、別にする。

## 設計

- 静的なファイル：`app/public/_headers`（Cloudflare の静的配信が読む）
- Worker が返す `/api/*`・`/audio/*`・`/special/*`：`worker/index.ts` の `SECURITY_HEADERS` で同じものを付ける
- 付けるもの：`X-Frame-Options: DENY`・`X-Content-Type-Options: nosniff`・`Referrer-Policy: strict-origin-when-cross-origin`・`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- テスト：Worker の単体テスト（API と衣装の配信に付く、通行証の Cookie が消えない、`_headers` と同じ中身）、同期の E2E（wrangler dev で、静的なページ・問のページ・API に付く）

## 完了条件

- 3つのテストが通る
- 本番の `/`・`/q/`・`/api/me` にヘッダーが付く

## 結果（完了時）

- テスト：パイプラインの回帰・単体、vitest 189、E2E 91、e2e:sync 9、worker の型、すべて通過
