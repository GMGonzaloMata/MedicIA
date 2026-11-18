import { expect, test } from "@playwright/test";
import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName } from "../support/e2e-database";
import { buildNpz } from "../support/npz-builder";
import { selectNpzEcg } from "./fixtures/npz-upload";

test("Inicio médico refleja la asignación y la carga real de un estudio", async ({ page, browser }) => {
  const database = createE2eDatabase();
  const patientContext = await browser.newContext();
  try {
    const tenantId = (await database.seedTenant(uniqueName("Clínica resumen"))).id;
    const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId });
    const summary = page.getByRole("region", { name: "Resumen clínico" });
    const values = summary.locator("dd");
    await expect(values).toHaveText(["0", "0"]);
    const patientPage = await patientContext.newPage();
    const name = uniqueName("Paciente resumen");
    const patient = await enterClinicAs(patientPage, database, { role: "patient", tenantId, fullName: name });
    await database.assignDoctor({ tenantId, membershipId: doctor.relationshipId, patientId: patient.relationshipId, createdByUserId: doctor.user.id });
    await page.reload();
    await expect(values).toHaveText(["1", "0"]);
    await expect(summary.getByText("Tus pacientes asignados todavía no tienen estudios cargados.")).toBeVisible();
    await patientPage.goto("/studies");
    await selectNpzEcg(patientPage);
    await patientPage.getByLabel("Archivo del electrocardiograma").setInputFiles({ name: "ecg-sintetico.npz", mimeType: "application/octet-stream", buffer: buildNpz() });
    await patientPage.getByRole("button", { name: "Subir estudio" }).click();
    await expect(patientPage.getByText("Estudio 1 guardado.")).toBeVisible();
    await page.reload();
    await expect(values).toHaveText(["1", "1"]);
    const link = summary.getByRole("link", { name: `Ver estudio 1 de ${name}` });
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await link.click();
    await expect(page).toHaveURL(/\/studies\/[\da-f-]+$/);
  } finally {
    await patientContext.close();
    await database.close();
  }
});
