import { expect, test } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueEmail, uniqueName, type E2eDatabase } from "../support/e2e-database";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

test("el administrador ve solo el personal y los pacientes de su clínica", async ({ page }, testInfo) => {
  const tenant = await database.seedTenant(uniqueName("Clínica de gestión"));
  const otherTenant = await database.seedTenant(uniqueName("Otra clínica"));
  const doctorName = uniqueName("Doctora Alba");
  const patientName = uniqueName("Paciente Bruno");
  const externalName = uniqueName("Persona externa");
  const doctorUser = await database.seedUser({ email: uniqueEmail("medico"), fullName: doctorName });
  const patientUser = await database.seedUser({ email: uniqueEmail("paciente"), fullName: patientName });
  const externalUser = await database.seedUser({ email: uniqueEmail("externo"), fullName: externalName });
  await database.linkAsDoctor({ userId: doctorUser.id, tenantId: tenant.id });
  await database.seedPatient({
    userId: patientUser.id,
    tenantId: tenant.id,
    fullName: patientName,
    documentNumber: String(Date.now()).slice(-8).padEnd(40, "9"),
  });
  await database.linkAsDoctor({ userId: externalUser.id, tenantId: otherTenant.id });
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { level: 1, name: "Usuarios" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(doctorName);
  await expect(page.getByRole("main")).toContainText("Especialidad: Cardiología");
  await expect(page.getByRole("main")).not.toContainText(externalName);
  await page.getByRole("link", { name: "Pacientes" }).click();
  await expect(page).toHaveURL(/tab=patients/);
  await expect(page.getByRole("main")).toContainText(patientName);
  await expect(page.getByRole("main")).toContainText("Médicos asignados");
  await expect(page.getByRole("main")).not.toContainText(externalName);
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("listitem").filter({ hasText: patientName })).toContainText("Médicos asignados:");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
