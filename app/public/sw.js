// オフラインで使うための Service Worker（T030）。
// - 画面：ネットワーク優先、つながらなければ保存した index.html
// - /assets/*（ビルドごとに名前が変わる）：保存したものを優先
// - /data/*.json：保存したものをすぐ返し、裏で取り直す（次の起動で新しいデータが反映される）
// - /api/*：保存しない（未送信の回答はアプリの仕組みでオンラインに戻ったら送る）
const VERSION = "v2";
// 照合では Vary ヘッダーを無視する（モジュールの JS は Origin 付きで読まれ、保存時のリクエストと食い違うため）
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;

// インストール時に、画面・JS／CSS・全データを先に保存する（初めて開いた直後から機内モードで解けるように）
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      const html = await fetch("/", { cache: "no-cache" });
      const text = await html.clone().text();
      await shell.put("/", html);
      const assets = [...text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await shell.addAll([...new Set(assets), "/favicon.svg", "/manifest.webmanifest"]);
      const data = await caches.open(DATA);
      const indexRes = await fetch("/data/index.json", { cache: "no-cache" });
      const index = await indexRes.clone().json();
      await data.put("/data/index.json", indexRes);
      await data.addAll(index.sets.map((s) => `/data/${s.file}`));
    })(),
  );
  self.skipWaiting();
});

// 新しい版が入ったら、古い版の保存を消す
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== DATA) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// 新しい index.html が使わなくなった古い JS／CSS を消す（デプロイのたびにたまらないように）
async function trimAssets(html) {
  const keep = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
  if (keep.size === 0) return;
  const shell = await caches.open(SHELL);
  for (const req of await shell.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !keep.has(path)) await shell.delete(req);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // 問ごとの静的ページ（T045）・サイトマップはアプリの画面ではないので、保存も差し替えもしない
  if (url.pathname.startsWith("/q/") || url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt") return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            await (await caches.open(SHELL)).put("/", res.clone());
            event.waitUntil(trimAssets(await res.clone().text()));
          }
          return res;
        } catch {
          return (await caches.match("/", { ignoreVary: true })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/data/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA);
        const cached = await cache.match(url.pathname, { ignoreVary: true });
        const update = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(url.pathname, res.clone());
            return res;
          })
          .catch(() => undefined);
        if (cached) {
          event.waitUntil(update);
          return cached;
        }
        return (await update) ?? Response.error();
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.svg") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { ignoreVary: true });
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      })(),
    );
  }
});
