// 課金衣装を手元で本物の絵で確かめる（手順は docs/setup.md）。本番の通行証の代わりに、/special/* を手元の audio/samples_char/special/ から返し、管理者の印を付けて開く。
//   npm run build && npx vite preview --port 4176 --strictPort   # 別の窓で立てておく
//   node scripts/special-preview.cjs hoshiyomi                   # ブラウザの窓が開く。自由に触れる（閉じると終わる）
//   node scripts/special-preview.cjs hoshiyomi --shots ../screenshots   # 窓を出さず、ホームと解く画面を撮って終わる
// 動画（H.264）はテスト用の Chromium では再生できないので、インストール済みの Chrome を使う
const { chromium, devices } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const [id, flag, dir] = process.argv.slice(2);
if (!id) throw new Error("衣装の ID を渡す（hoshiyomi nocturne yukihana hakama diva）");
const ROOT = path.resolve(__dirname, "../../audio/samples_char/special");
if (!fs.existsSync(path.join(ROOT, id))) throw new Error(`${ROOT}/${id} がない。python3 pipeline/ritsu_special_finish.py download ${id} で R2 から取り戻す`);
const TYPES = { webp: "image/webp", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg" };
const URL_BASE = process.env.PREVIEW_URL || "http://localhost:4176/";

(async () => {
  const shots = flag === "--shots";
  const browser = await chromium.launch({ channel: "chrome", headless: shots, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const { defaultBrowserType, ...phone } = devices["iPhone 13"];
  const context = await browser.newContext({ ...phone, viewport: { width: 390, height: 760 } });
  await context.route("**/special/**", (route) => {
    const file = path.join(ROOT, new URL(route.request().url()).pathname.replace("/special/", ""));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ status: 200, contentType: TYPES[file.split(".").pop()], body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  // ログインしていないと起動時に管理者の印が消えるので、消えないようにする（e2e/character.spec.ts の beAdmin と同じ）
  await page.addInitScript((theme) => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k) {
      if (k !== "tanto.admin.v1") remove.call(this, k);
    };
    localStorage.setItem("tanto.admin.v1", "1");
    localStorage.setItem("tanto.character.theme.v1", theme);
    localStorage.setItem("tanto.character.revealed.v1", JSON.stringify([theme]));
  }, id);
  await page.goto(URL_BASE);
  if (!shots) {
    await new Promise((done) => browser.on("disconnected", done));
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(dir, `${id}-home.png`) });
  await page.locator("button", { hasText: "はじめる" }).first().click();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(dir, `${id}-play.png`) });
  await browser.close();
  console.log(`✅ ${dir}/${id}-home.png・${id}-play.png`);
})();
