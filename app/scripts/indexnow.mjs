// 公開中のページの URL を IndexNow で Bing などに知らせる（T073）。サイトマップの巡回を待たずに済む。Google は IndexNow を使わない。
//   node scripts/indexnow.mjs --dry-run              # 送らずに件数だけ表示
//   node scripts/indexnow.mjs                        # 本番のサイトマップの URL をすべて送る（初回）
//   node scripts/indexnow.mjs --since 2026-11-07     # 更新日がこの日以降の URL だけ送る（解説を足したあと）
// 本番のサイトマップを読むので、push して配信が終わってから流す。鍵は秘密ではない（public/<鍵>.txt で公開して持ち主を示す仕組み）
import { fileURLToPath } from "node:url";

export const KEY = "07361959c353627dd086ea76929a436e";
const SITE = (process.env.SITE_URL ?? "https://tantan.reivindicatio0321.workers.dev").replace(/\/$/, "");
const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 10000; // 1回に送れる上限

/** サイトマップ（目次でも URL の一覧でも）から [URL, 更新日] を取り出す */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<(?:url|sitemap)>\s*<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2] ?? ""]);
}

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} が ${r.status}`);
  return r.text();
}

async function urls() {
  const top = await get(`${SITE}/sitemap.xml`);
  if (!top.includes("<sitemapindex")) return parseSitemap(top);
  const out = [];
  for (const [child] of parseSitemap(top)) out.push(...parseSitemap(await get(child)));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const i = args.indexOf("--since");
  const since = i >= 0 ? args[i + 1] : "";
  const key = await get(`${SITE}/${KEY}.txt`).then((t) => t.trim(), () => "");
  if (key !== KEY) {
    const msg = `${SITE}/${KEY}.txt に鍵がない（まだ配信されていない？）`;
    if (!dry) throw new Error(msg);
    console.log(`⚠️ ${msg}`);
  }
  const all = await urls();
  // 更新日のない URL（トップ）は、日付で絞るときも送る
  const list = all.filter(([, d]) => !since || !d || d >= since).map(([u]) => u);
  console.log(`サイトマップ ${all.length} 件のうち ${list.length} 件を送る${since ? `（${since} 以降）` : ""}`);
  if (dry || !list.length) return;
  const host = new URL(SITE).host;
  for (let n = 0; n < list.length; n += BATCH) {
    const body = { host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: list.slice(n, n + BATCH) };
    const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
    // 200 は受け付け、202 は鍵の確認待ち（どちらも成功）。それ以外は理由を出して止める
    console.log(`  ${n + 1}〜${n + body.urlList.length} 件目：${r.status} ${r.status === 200 || r.status === 202 ? "受け付けられた" : await r.text()}`);
    if (r.status !== 200 && r.status !== 202) process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
