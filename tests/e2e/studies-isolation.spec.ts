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
    name: "estudio.npz",
    mimeType: "application/octet-stream",
    buffer: buildNpz(),
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();
}

const visibleRows = (page: Page) => page.getByText("Electrocardiograma", { exact: true }).filter({ visible: true });

test("un paciente no ve estudios de otro ni abre las pantallas del médico", async ({ page, browser }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica aislamiento"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");
  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await enterClinicAs(otherPage, database, { role: "patient", tenantId });
  await otherPage.goto("/studies");
  await expect(otherPage.getByText("Todavía no hay estudios cargados.")).toBeVisible();
  await expect(visibleRows(otherPage)).toHaveCount(0);

  // Las pantallas del médico llevan a un paciente a su propia lista.
  await otherPage.goto("/patients");
  await expect(otherPage).toHaveURL(/\/studies$/);
  await otherContext.close();
});

test("un médico no abre a un paciente sin asignación", async ({ page, browser }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica sin asignación"))).id;
  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  const patient = await enterClinicAs(patientPage, database, { role: "patient", tenantId });
  await patientContext.close();

  await enterClinicAs(page, database, { role: "doctor", tenantId });
  await page.goto(`/patients/${patient.relationshipId}`);

  await expect(page.getByText("No tenés acceso a este paciente.")).toBeVisible();
  await page.goto("/studies");
  await expect(page).toHaveURL(/\/patients$/);
});

test("el administrador sin rol de médico ve el aviso y ningún dato", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica administración"))).id;
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId });

  await expect(page.getByRole("link", { name: "Mis estudios" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Mis pacientes" })).toHaveCount(0);

  for (const path of ["/studies", "/patients"]) {
    await page.goto(path);
    await expect(page.getByText("Tu vínculo con la clínica no incluye estudios.")).toBeVisible();
  }
});

test("tras cerrar sesión las pantallas de estudios llevan a ingresar", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica salida"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/studies");
  await expect(page).toHaveURL(/\/sign-in/);
});
