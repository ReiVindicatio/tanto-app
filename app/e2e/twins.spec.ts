import { expect, test } from "@playwright/test";
import { gotoSubject, openHome, openYear } from "./helpers";

// よく似た肢（T050）

const setOf = (id: string) => id.replace(/-q\d+.*$/, "");

test("年度ごとに解く：組の1枚目では相手を出さず、2枚目に答えると違う部分に色を付けて並べる", async ({ page, request }) => {
  const twins = await (await request.get("/data/twins.json")).json();
  const index = await (await request.get("/data/index.json")).json();
  // 予備の同じ年度の中にある組のうち、2枚目が一番前にあるもの（解く枚数が少なくて済む）
  let best: { set: string; data: any; first: number; second: number } | null = null;
  for (const p of twins.pairs) {
    const set = setOf(p.a);
    if (set !== setOf(p.b) || !set.startsWith("yobi-")) continue;
    const data = await (await request.get(`/data/${set}.json`)).json();
    const cards = data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => s.id);
    const [i, j] = [cards.indexOf(p.a), cards.indexOf(p.b)].sort((x, y) => x - y);
    if (i < 0) continue;
    if (!best || j < best.second) best = { set, data, first: i, second: j };
    if (best.second < 8) break;
  }
  expect(best).not.toBeNull();
  const info = index.sets.find((s: any) => s.id === best!.set);
  const truth = new Map<string, boolean>(
    best!.data.statements.filter((s: any) => s.truth_at_exam && !s.review_flag).map((s: any) => [s.text, s.truth_at_exam.value]),
  );

  await openHome(page);
  await openYear(page, info.subject_name, info.exam.era, "肢で解く");
  for (let k = 0; k <= best!.second; k++) {
    const text = await page.locator(".page .statement").innerText();
    await page.getByRole("button", { name: truth.get(text) ? "○" : "×", exact: true }).click();
    await expect(page.locator(".page .result")).toBeVisible();
    if (k === best!.first) await expect(page.locator(".page .twins")).toHaveCount(0); // 相手はこのあと出る
    if (k === best!.second) {
      // 見出し（よく似た肢 ○×が逆の肢 N件）を押すと開く
      await expect(page.locator(".page .twins-details summary")).toContainText("○×が逆の肢");
      await page.locator(".page .twins-details summary").click();
      const tw = page.locator(".page .twins");
      await expect(tw).toBeVisible();
      await expect(tw.locator(".twin-row")).toHaveCount(2);
      await expect(tw.locator("mark.twin-diff").first()).toBeVisible();
      await expect(tw).toContainText("出題時点の公式の解答");
      break;
    }
    await page.getByRole("button", { name: "次へ" }).click();
  }
});

test("科目の画面から、よく似た肢を2枚続けて解く。2枚目の後にだけ相手が出る", async ({ page }) => {
  await openHome(page);
  await gotoSubject(page, "刑法");
  const section = page.locator(".set.twins-set");
  const button = section.getByRole("button", { name: /続けて解く（\d+組）/ });
  await expect(button).toBeVisible();
  const n = Number((await button.innerText()).match(/（(\d+)組）/)![1]);
  await button.click();
  await expect(page.locator(".toolbar")).toContainText(`刑法 よく似た肢　1 / ${n * 2}`);

  await page.getByRole("button", { name: "○", exact: true }).click();
  await expect(page.locator(".page .result")).toBeVisible();
  await expect(page.locator(".page .twins")).toHaveCount(0);
  const first = await page.locator(".page .statement").innerText();
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByRole("button", { name: "○", exact: true }).click();
  await page.locator(".page .twins-details summary").click();
  const tw = page.locator(".page .twins");
  await expect(tw).toBeVisible();
  // 相手（1枚目）の本文が並ぶ（解答欄の番号は除いて比べる）
  await expect(tw.locator(".twin-row").nth(1)).toContainText(first.replace(/\s*[［\[].*?[］\]]\s*$/, "").slice(0, 20));
});
