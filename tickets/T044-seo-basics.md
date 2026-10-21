# T044 検索エンジンに載せる（robots・説明・OGP・サイトマップ）

- 状態：完了
- マイルストーン：M3 公開
- 優先度：高
- 依存：T043
- 更新：2026-10-21

## 目的・背景

自分専用だった頃の設定（`robots.txt` の `Disallow: /` と `noindex`）が残っていて、公開しても検索に出なかった。

## 決まったこと（2026-10-21 ユーザー決定：A・B どちらもやる）

- `robots.txt`：全部可、`/api/` だけ不可。サイトマップの場所を書く
- `index.html`：`noindex` を外し、説明（description）と OGP（共有したときの題名・説明・画像）を入れる。「非公式」と書く
- サイトマップ：T045 の問ごとのページと合わせて、ビルドの最後に `dist/sitemap.xml` を作る
- Google Search Console への登録はユーザーがする（所有の確認のタグは、コードをもらってから入れる）

## 結果

- ✅ 上のとおり。E2E：robots.txt・サイトマップ・noindex がないこと（`e2e/pages.spec.ts`）
- Service Worker（`sw.js`）が、開いたページをアプリの画面として保存し直していたので、`/q/`・`/sitemap.xml`・`/robots.txt` は素通しにした（版を v2 に）
- 残り：Search Console の登録とサイトマップの送信（ユーザー）
