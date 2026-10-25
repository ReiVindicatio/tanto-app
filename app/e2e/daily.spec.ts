import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

test("今日の○問：問題数と範囲を選んで始めると、その数だけ出る。選んだ設定は再読み込み後も残る（T022）", async ({ page }) => {
  await openHome(page);
  await expect(page.locator(".hero-title")).toContainText("今日の30問"); // 既定は30問
  await expect(page.locator(".hero-breakdown")).toContainText("全科目：新規 30");
  await page.getByRole("button", { name: "10問" }).click();
  await page.getByRole("group", { name: "範囲" }).getByRole("button", { name: "刑法", exact: true }).click();
  await expect(page.locator(".hero-breakdown")).toContainText("刑法：新規 10");
  await page.getByRole("button", { name: "はじめる" }).click();
  await expect(page.locator(".toolbar")).toContainText("今日の10問　1 / 10");
  await expect(page.locator("main .muted.small").nth(1)).toContainText("刑法"); // 出典の科目名
  await page.goBack();
  await page.reload();
  await expect(page.locator(".hero-title")).toContainText("今日の10問");
  await expect(page.getByRole("group", { name: "範囲" }).getByRole("button", { name: "刑法", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("結果画面：正答率・科目ごと・まちがえた肢の一覧が出て、まちがえた肢だけもう一度できる（T023）", async ({ page, request }) => {
  await openHome(page);
  await page.getByRole("button", { name: "10問" }).click();
  await page.getByRole("button", { name: "はじめる" }).click();
  // 全部「○」で答える（○×の分布は公式の解答どおりなので、まちがえる数はデータから決まる）
  let wrong = 0;
  const truths = new Map<string, boolean>();
  // 新規は各科目の新しい年度（R08）から入るので、R08 の全科目の○×を引けるようにする
  const index = await (await request.get("/data/index.json")).json();
  for (const set of index.sets.filter((x: any) => x.exam.year === 2026)) {
    const d = await (await request.get(`/data/${set.file}`)).json();
    for (const s of d.statements) if (s.truth_at_exam) truths.set(s.text, s.truth_at_exam.value);
  }
  for (let k = 0; k < 10; k++) {
    const text = await page.locator(".page .statement").innerText();
    if (truths.get(text) === false) wrong++;
    await page.getByRole("button", { name: "○", exact: true }).click();
    await page.getByRole("button", { name: "次へ" }).click();
  }
  await expect(page.getByText(`${10 - wrong} / 10 正解`)).toBeVisible();
  await expect(page.locator(".donut")).toHaveAttribute("aria-label", `正答率 ${Math.round(((10 - wrong) / 10) * 100)}%`);
  await expect(page.locator(".wrong-item")).toHaveCount(wrong);
  test.skip(wrong === 0, "今回の10枚にまちがえる肢がなかった");
  await page.locator(".wrong-item").first().locator(":scope > summary").click();
  // 解説（結論）か「この肢の解説はまだありません」が見える（生成情報は「この解説について」に畳んである）
  await expect(page.locator(".wrong-item").first().locator(".explanation .conclusion, :scope > .muted.small").first()).toBeVisible();
  await page.getByRole("button", { name: /まちがえた肢だけもう一度/ }).click();
  await expect(page.locator(".toolbar")).toContainText(`1 / ${wrong}`);
});
