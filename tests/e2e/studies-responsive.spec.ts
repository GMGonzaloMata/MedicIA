import { expect, test, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { buildNpz } from "../support/npz-builder";

// Las tres pantallas de estudios se prueban en los tres anchos y los dos esquemas de color dentro de una sola
// ejecución (el viewport se fija acá), así que corre solo en el proyecto de escritorio.
test.beforeEach(({ page }, testInfo) => {
  void page;
  test.skip(testInfo.project.name !== "desktop", "Fija sus propios anchos de pantalla.");
});

const WIDTHS = [375, 768, 1280] as const;
const SCHEMES = ["light", "dark"] as const;
const TABLE_BREAKPOINT = 768;

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function focusedOutlineIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);

    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
  });
}

// Tabula hasta que el foco llega al elemento que cumple el selector (con un tope, para no quedar en un ciclo).
async function tabTo(page: Page, selector: string, maxTabs = 40) {
  for (let step = 0; step < maxTabs; step += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((css) => document.activeElement?.matches(css) ?? false, selector)) {
      return;
    }
  }
  throw new Error("El foco no llegó al elemento esperado con el teclado.");
}

async function world() {
  const tenantId = (await database.seedTenant(uniqueName("Clínica responsive"))).id;
  const patientName = uniqueName("Pac responsive");

  return { tenantId, patientName };
}

test("las pantallas del paciente y del médico se adaptan a tres anchos y a los dos esquemas de color", async ({
  page,
  browser,
}) => {
  const { tenantId, patientName } = await world();
  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  const patient = await enterClinicAs(patientPage, database, { role: "patient", tenantId, fullName: patientName });
  await database.seedStudy({ tenantId, patientId: patient.relationshipId, uploadedByUserId: patient.user.id });

  const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId });
  await database.assignDoctor({
    tenantId,
    membershipId: doctor.relationshipId,
    patientId: patient.relationshipId,
    createdByUserId: doctor.user.id,
  });

  const screens: { name: string; page: Page; path: string }[] = [
    { name: "Mis estudios", page: patientPage, path: "/studies" },
    { name: "Mis pacientes", page, path: "/patients" },
    { name: "Estudios del paciente", page, path: `/patients/${patient.relationshipId}` },
  ];

  for (const screen of screens) {
    for (const scheme of SCHEMES) {
      for (const width of WIDTHS) {
        const label = `${screen.name} · ${scheme} · ${width} px`;
        await screen.page.setViewportSize({ width, height: 900 });
        await screen.page.emulateMedia({ colorScheme: scheme });
        await screen.page.goto(screen.path);
        await expect(screen.page.getByRole("heading", { level: 1 }), label).toBeVisible();

        expect(await hasNoHorizontalScroll(screen.page), `${label}: desplazamiento horizontal`).toBe(true);

        // La lista pasa de tarjetas a tabla desde el ancho de tablet.
        const table = screen.page.getByRole("table");
        if (width >= TABLE_BREAKPOINT) {
          await expect(table, label).toBeVisible();
        } else {
          await expect(table, label).toBeHidden();
        }
      }
    }
  }

  await patientContext.close();
});

test("los estados tienen texto además de color", async ({ page }) => {
  const { tenantId } = await world();
  const patient = await enterClinicAs(page, database, { role: "patient", tenantId });
  await database.seedStudy({ tenantId, patientId: patient.relationshipId, uploadedByUserId: patient.user.id });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/studies");

  await expect(page.getByRole("cell", { name: "Cargado" })).toBeVisible();

  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "no-es-npz.npz",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("no es un zip"),
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();

  // Un error es un texto con ícono dentro de una alerta, no solo un color.
  const alert = page.getByRole("alert").filter({ hasText: "El archivo no es un .npz válido." });
  await expect(alert).toContainText("El archivo no es un .npz válido.");
  await expect(alert.locator("svg")).toBeVisible();
});

test("la carga y la eliminación se completan solo con teclado, con foco visible", async ({ page }) => {
  const { tenantId } = await world();
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/studies");

  // El contenido de la sesión llega por streaming: se espera al formulario antes de tabular.
  await expect(page.getByLabel("Archivo del electrocardiograma")).toBeVisible();

  // Tabulación hasta el campo de archivo; el foco es visible.
  await tabTo(page, "#study-file");
  expect(await focusedOutlineIsVisible(page)).toBe(true);

  // Elegir el archivo (el diálogo del sistema no se maneja con teclado en la prueba) y llegar al botón.
  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "ecg.npz",
    mimeType: "application/octet-stream",
    buffer: buildNpz(),
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Subir estudio" })).toBeFocused();
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();

  // Tabulación hasta «Eliminar», abrir con Enter, cerrar con Escape y recuperar el foco.
  await tabTo(page, "button[aria-label^='Eliminar el estudio']");
  const deleteButton = page.getByRole("button", { name: "Eliminar el estudio 1" });
  await expect(deleteButton).toBeFocused();
  expect(await focusedOutlineIsVisible(page)).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByText("Se borrará el estudio 1 y su archivo. No se puede deshacer.").filter({ visible: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Se borrará el estudio 1 y su archivo. No se puede deshacer.").filter({ visible: true })).toBeHidden();
  await expect(deleteButton).toBeFocused();

  // Confirmar con el teclado elimina el estudio.
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Eliminar estudio" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();
});
