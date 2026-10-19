// アプリのアイコン（PNG）を SVG から作る（T030）。図柄は○×だけ（法務省のマーク等を思わせるものは使わない）
//   node scripts/icons.mjs   → public/icons/*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// 地いっぱいの図柄（maskable は端が切られても○×が残るよう、図柄を内側 60% に収める）
const svg = (scale, rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <rect width="64" height="64" ${rounded ? 'rx="14"' : ""} fill="#f66e61"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <circle cx="22" cy="32" r="11" fill="none" stroke="#fff" stroke-width="5"/>
    <path d="M38 22 L54 42 M54 22 L38 42" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>`;

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
const icons = [
  { name: "icon-192.png", size: 192, scale: 1, rounded: false },
  { name: "icon-512.png", size: 512, scale: 1, rounded: false },
  { name: "icon-maskable-512.png", size: 512, scale: 0.75, rounded: false },
  { name: "apple-touch-icon.png", size: 180, scale: 0.9, rounded: false }, // iOS が角を丸める
];
const browser = await chromium.launch();
for (const i of icons) {
  const page = await browser.newPage({ viewport: { width: i.size, height: i.size } });
  await page.setContent(`<html><body style="margin:0">${svg(i.scale, i.rounded)}</body></html>`);
  await page.screenshot({ path: new URL(i.name, out).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons:", icons.map((i) => i.name).join(", "));
