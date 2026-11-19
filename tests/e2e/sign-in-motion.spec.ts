import { expect, test } from "@playwright/test";

test("el ingreso conserva el ECG fijo cuando se pide reducir el movimiento", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");

  const illustration = page.getByRole("complementary", { name: "Ilustración de electrocardiograma" });
  await expect(illustration.locator(".medicia-login-trace")).toBeVisible();
  await expect(illustration.locator(".medicia-login-ribbon")).toHaveCSS("animation-name", "none");
});

test("el ingreso conserva la animación de 18 s con la preferencia de movimiento por defecto", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/sign-in");

  const ribbon = page.getByRole("complementary", { name: "Ilustración de electrocardiograma" })
    .locator(".medicia-login-ribbon");
  await expect(ribbon).toHaveCSS("animation-name", "medicia-login-scroll");
  await expect(ribbon).toHaveCSS("animation-duration", "18s");
  await expect(ribbon).toHaveCSS("animation-timing-function", "linear");
  await expect(ribbon).toHaveCSS("animation-iteration-count", "infinite");
});
