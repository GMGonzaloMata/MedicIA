import { expect, test } from "@playwright/test";

test("sin sesión, el inicio lleva a la pantalla de ingreso y recuerda el destino", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ingresar" })).toBeVisible();
});
