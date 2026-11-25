import { expect, test } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { openUploadForm } from "./fixtures/npz-upload";

const PDF_FILE = {
  name: `estudio-sintetico-${"onda".repeat(32)}.PDF`,
  mimeType: "application/octet-stream",
  buffer: Buffer.from("PDF sintético para el selector; no se sube"),
};

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

test.beforeEach(async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica selector PDF"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();
  await openUploadForm(page);
});

test("el selector PDF se alcanza y abre por teclado, y quitar el archivo devuelve el foco", async ({ page }) => {
  const region = page.getByRole("region", { name: "Carga de PDF", exact: true });
  const picker = region.getByRole("button", { name: "Elegir PDF", exact: true });
  const type = page.getByLabel("Tipo de estudio", { exact: true });
  await expect(page.getByLabel("Formato del archivo", { exact: true })).toHaveValue("PDF");
  await expect(type).toHaveValue("");
  await expect(type).toHaveJSProperty("required", true);
  await expect(picker).toHaveAccessibleDescription(/Un PDF Mortara compatible de hasta 2 MB/);

  // El HTML inicial ya admite foco; el cambio de formulario confirma que React está interactivo.
  const format = page.getByLabel("Formato del archivo", { exact: true });
  const file = page.getByLabel("Archivo del electrocardiograma", { exact: true });
  await expect(async () => {
    await format.selectOption("NPZ");
    await expect(file).toHaveAttribute("accept", /\.npz/, { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await format.selectOption("PDF");
  await expect(file).toHaveAttribute("accept", ".pdf");

  // Playwright activa la interceptación en Chromium de forma asíncrona. Registrala antes
  // de navegar con Tab: Enter en paralelo con el registro puede abrir el selector sin interceptarlo.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    (async () => {
      await type.focus();
      await page.keyboard.press("Tab");
      await expect(picker).toBeFocused();
      await expect(picker).not.toHaveCSS("outline-style", "none");
      await expect(picker).not.toHaveCSS("outline-width", "0px");
      await page.keyboard.press("Enter");
    })(),
  ]);
  await chooser.setFiles(PDF_FILE);
  await expect(region.getByText(PDF_FILE.name, { exact: true })).toBeVisible();
  await expect(region.getByText(`${PDF_FILE.buffer.length} bytes`, { exact: true })).toBeVisible();
  const replace = region.getByRole("button", { name: "Reemplazar PDF", exact: true });
  await expect(replace).toBeVisible();

  // Verifica el reflujo del nombre largo sin enviar el archivo.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const noHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      expect(noHorizontalScroll, `${colorScheme} · ${width} px`).toBe(true);
    }
  }

  await replace.focus();
  await page.keyboard.press("Tab");
  await expect(region.getByRole("button", { name: "Quitar PDF", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(region.getByText(PDF_FILE.name, { exact: true })).toHaveCount(0);
  await expect(region.getByText("PDF quitado. Elegí otro archivo para subir.", { exact: true })).toBeVisible();
  await expect(picker).toBeFocused();
  await expect(type).toHaveValue("");
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();
});

test("el selector PDF anuncia el rechazo y no arrastra la selección a NPZ", async ({ page }) => {
  const format = page.getByLabel("Formato del archivo", { exact: true });
  const type = page.getByLabel("Tipo de estudio", { exact: true });
  const region = page.getByRole("region", { name: "Carga de PDF", exact: true });
  const file = page.getByLabel("Archivo del electrocardiograma", { exact: true });
  await type.selectOption({ label: "Electrocardiograma (ECG)" });
  await file.setInputFiles(PDF_FILE);
  await expect(region.getByText(PDF_FILE.name, { exact: true })).toBeVisible();

  const replace = region.getByRole("button", { name: "Reemplazar PDF", exact: true });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), replace.click()]);
  await chooser.setFiles({ ...PDF_FILE, name: "no-es-un-pdf.txt", mimeType: "application/pdf" });
  const rejection = "Elegí un archivo con extensión .pdf. El contenido se valida en el servidor.";
  const alert = page.getByRole("alert").filter({ hasText: rejection });
  await expect(alert).toHaveText(rejection);
  await expect(alert.locator("..")).toBeFocused();
  await expect(region.getByText(PDF_FILE.name, { exact: true })).toHaveCount(0);
  await expect(region.getByRole("button", { name: "Elegir PDF", exact: true })).toBeVisible();

  await format.selectOption({ label: "NPZ (compatibilidad)" });
  await expect(region).toHaveCount(0);
  await expect(type).toHaveValue("");
  await expect(file).toHaveAttribute("accept", ".npz");
  await expect(file).toHaveValue("");
  await expect(alert).toHaveCount(0);

  await format.selectOption({ label: "PDF Mortara" });
  await file.setInputFiles(PDF_FILE);
  await expect(region.getByText(PDF_FILE.name, { exact: true })).toBeVisible();
  await format.selectOption({ label: "NPZ (compatibilidad)" });
  await expect(file).toHaveValue("");
  await format.selectOption({ label: "PDF Mortara" });
  await expect(region.getByText("Ningún PDF seleccionado.", { exact: true })).toBeVisible();
  await expect(type).toHaveValue("");
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();
});
