import { expect, type Page } from "@playwright/test";

// El formulario puede estar en un modal que abre «Cargar estudio» o directamente en la página. Se espera a
// cualquiera de los dos y se abre el modal si hace falta.
export async function openUploadForm(page: Page): Promise<void> {
  const format = page.getByLabel("Formato del archivo", { exact: true });
  const opener = page.getByRole("button", { name: "Cargar estudio" });
  await expect(format.or(opener).first()).toBeVisible();
  if (!(await format.isVisible())) {
    await opener.click();
    await expect(format).toBeVisible();
  }
}

export async function selectNpzEcg(page: Page): Promise<void> {
  await openUploadForm(page);
  await page.getByLabel("Formato del archivo", { exact: true }).selectOption({ label: "NPZ (compatibilidad)" });
  await page.getByLabel("Tipo de estudio", { exact: true }).selectOption({ label: "Electrocardiograma (ECG)" });
}

// Cierra el modal de carga si quedó abierto, para seguir usando la lista de estudios.
export async function closeUploadDialog(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Cerrar ventana" });
  if (await close.isVisible()) {
    await close.click();
  }
}
