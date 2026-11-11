import { expect, test, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { buildNpz } from "../support/npz-builder";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

async function uploadValidStudy(page: Page) {
  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "ecg-de-prueba.npz",
    mimeType: "application/octet-stream",
    buffer: buildNpz(),
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();
}

// En pantallas anchas la lista es una tabla y en el móvil son tarjetas: solo una de las dos es visible.
const visibleRows = (page: Page) => page.getByText("Electrocardiograma", { exact: true }).filter({ visible: true });

test("el paciente sube estudios, ve su lista numerada y otro paciente no los ve", async ({ page, browser }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica estudios"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });

  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await expect(page).toHaveURL(/\/studies$/);
  await expect(page.getByRole("heading", { name: "Mis estudios" })).toBeVisible();
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();

  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
  await expect(visibleRows(page)).toHaveCount(1);

  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 2 guardado.")).toBeVisible();
  await expect(visibleRows(page)).toHaveCount(2);

  // El nombre del archivo subido no se guarda ni se muestra.
  await expect(page.getByText("ecg-de-prueba")).toHaveCount(0);

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await enterClinicAs(otherPage, database, { role: "patient", tenantId });
  await otherPage.goto("/studies");

  await expect(otherPage.getByText("Todavía no hay estudios cargados.")).toBeVisible();
  await otherContext.close();
});

test("un archivo inválido se rechaza con el motivo y no consume número", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica rechazo"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");

  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "no-es-npz.npz",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("esto no es un zip"),
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();

  await expect(page.getByText("El archivo no es un .npz válido.")).toBeVisible();

  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
});

test("un administrador sin rol de médico no ve estudios", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica administración"))).id;
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId });
  await page.goto("/studies");

  await expect(page.getByText("Tu vínculo con la clínica no incluye estudios.")).toBeVisible();
});
