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

const visibleRows = (page: Page) => page.getByText("Electrocardiograma", { exact: true }).filter({ visible: true });

test("el médico ve solo a sus pacientes, les sube estudios y el paciente los ve", async ({ page, browser }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica médico"))).id;
  const assigned = uniqueName("Asignada");
  const unassigned = uniqueName("Ajena");

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  const patient = await enterClinicAs(patientPage, database, { role: "patient", tenantId, fullName: assigned });

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const other = await enterClinicAs(otherPage, database, { role: "patient", tenantId, fullName: unassigned });
  await otherContext.close();

  const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId });
  await database.assignDoctor({
    tenantId,
    membershipId: doctor.relationshipId,
    patientId: patient.relationshipId,
    createdByUserId: doctor.user.id,
  });

  await page.getByRole("link", { name: "Mis pacientes" }).first().click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByRole("link", { name: assigned })).toBeVisible();
  await expect(page.getByText(unassigned)).toHaveCount(0);

  await page.getByRole("link", { name: assigned }).click();
  await expect(page.getByRole("heading", { name: `Estudios de ${assigned}` })).toBeVisible();
  await uploadValidStudy(page);
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
  await expect(visibleRows(page)).toHaveCount(1);

  // El paciente ve el estudio que cargó su médico.
  await patientPage.goto("/studies");
  await expect(visibleRows(patientPage)).toHaveCount(1);
  await patientContext.close();

  // Un paciente sin asignación no se abre: sin datos.
  await page.goto(`/patients/${other.relationshipId}`);
  await expect(page.getByText("No tenés acceso a este paciente.")).toBeVisible();
  await expect(page.getByText(unassigned)).toHaveCount(0);

  // Al terminar la asignación el médico deja de ver al paciente.
  await database.endAssignment({
    tenantId,
    membershipId: doctor.relationshipId,
    patientId: patient.relationshipId,
    endedByUserId: doctor.user.id,
  });
  await page.goto("/patients");
  await expect(page.getByText("Todavía no tenés pacientes asignados.")).toBeVisible();
});
