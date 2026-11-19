import type { Page } from "@playwright/test";

export async function selectNpzEcg(page: Page): Promise<void> {
  await page.getByLabel("Formato del archivo", { exact: true }).selectOption({ label: "NPZ (compatibilidad)" });
  await page.getByLabel("Tipo de estudio", { exact: true }).selectOption({ label: "Electrocardiograma (ECG)" });
}
