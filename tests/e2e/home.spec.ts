import { expect, test } from "@playwright/test";

test("la página principal carga", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
