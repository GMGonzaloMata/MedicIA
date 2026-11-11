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
const deleteButton = (page: Page, number: number) =>
  page.getByRole("button", { name: `Eliminar el estudio ${number}` }).filter({ visible: true });

test("el paciente elimina un estudio propio con confirmación y el número no se reutiliza", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica eliminar"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");

  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
  await expect(visibleRows(page)).toHaveCount(1);

  // Escape cierra el diálogo sin borrar nada.
  await deleteButton(page, 1).click();
  await expect(page.getByText("Se borrará el estudio 1 y su archivo. No se puede deshacer.").filter({ visible: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Se borrará el estudio 1 y su archivo. No se puede deshacer.").filter({ visible: true })).toBeHidden();
  await expect(visibleRows(page)).toHaveCount(1);

  // Confirmar elimina el estudio.
  await deleteButton(page, 1).click();
  await page.getByRole("button", { name: "Eliminar estudio" }).click();
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();

  // El siguiente estudio no reutiliza el número 1.
  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 2 guardado.")).toBeVisible();
});

test("el estudio que cargó el médico no tiene botón para el paciente, pero sí para el médico", async ({
  page,
  browser,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica médico elimina"))).id;
  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  const patient = await enterClinicAs(patientPage, database, { role: "patient", tenantId, fullName: uniqueName("Pac") });

  const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId });
  await database.assignDoctor({
    tenantId,
    membershipId: doctor.relationshipId,
    patientId: patient.relationshipId,
    createdByUserId: doctor.user.id,
  });
  await page.goto(`/patients/${patient.relationshipId}`);
  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
  await expect(deleteButton(page, 1)).toBeVisible();

  await patientPage.goto("/studies");
  await expect(visibleRows(patientPage)).toHaveCount(1);
  await expect(patientPage.getByRole("button", { name: /^Eliminar el estudio/ })).toHaveCount(0);
  await patientContext.close();

  await deleteButton(page, 1).click();
  await page.getByRole("button", { name: "Eliminar estudio" }).click();
  await expect(page.getByText("Todavía no hay estudios cargados.")).toBeVisible();
});
