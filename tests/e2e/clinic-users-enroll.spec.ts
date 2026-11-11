import { expect, test } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueEmail, uniqueName, type E2eDatabase } from "../support/e2e-database";

let database: E2eDatabase;
test.beforeAll(() => { database = createE2eDatabase(); });
test.afterAll(async () => { await database.close(); });

test("el administrador da de alta a un paciente y puede reenviar su acceso", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica alta"));
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });
  const email = uniqueEmail("alta-paciente");
  const name = uniqueName("Paciente Alta");
  await page.goto("/users/new");
  await page.getByLabel("Tipo de persona").selectOption("PATIENT");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Nombre completo").fill(name);
  await page.getByLabel("Número de documento").fill(String(Date.now()).slice(-8));
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByText("La persona quedó vinculada a la clínica.", { exact: true })).toBeVisible();
  await page.goto("/users?tab=patients&page=1");
  await expect(page.getByRole("main")).toContainText(name);
  await page.getByRole("button", { name: "Reenviar acceso" }).click();
  await expect(page.getByText("Enviamos nuevamente el acceso.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("el médico solo ve pacientes en el alta y queda asignado", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica alta médica"));
  await enterClinicAs(page, database, { role: "doctor", tenantId: tenant.id });
  const name = uniqueName("Paciente Médico");
  await page.getByRole("link", { name: "Dar de alta a un paciente" }).click();
  await expect(page).toHaveURL(/\/users\/new$/);
  await expect(page.getByRole("heading", { name: "Dar de alta a una persona" })).toBeVisible();
  await expect(page.getByLabel("Tipo de persona")).toHaveCount(0);
  await expect(page.getByLabel("Matrícula")).toHaveCount(0);
  await page.locator("#enroll-email").fill(uniqueEmail("alta-medica"));
  await page.locator("#enroll-name").fill(name);
  await page.locator("#enroll-document").fill(String(Date.now()).slice(-8));
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByText(/El paciente quedó asignado a vos/)).toBeVisible();
  await page.goto("/patients");
  await expect(page.getByRole("main")).toContainText(name);
});
