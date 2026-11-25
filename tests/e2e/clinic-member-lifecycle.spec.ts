import { expect, test, type Browser, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";

const DOCTOR_UNAVAILABLE = /Tu médico ya no está disponible/;
const LAST_ADMIN = /No se puede desactivar al único administrador/;

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

// Segunda sesión del navegador, para tener a dos personas con la sesión abierta a la vez.
async function openSecondSession(browser: Browser): Promise<Page> {
  const baseURL = test.info().project.use.baseURL;
  const context = await browser.newContext({ baseURL });

  return context.newPage();
}

// Deja a un médico dentro de la clínica con la sesión abierta en `doctorPage` y a un administrador en `adminPage`.
async function seedClinicWithDoctorAndAdmin(browser: Browser, doctorPage: Page) {
  const clinicName = uniqueName("Clínica de ciclo de vida");
  const tenant = await database.seedTenant(clinicName);
  const doctor = await enterClinicAs(doctorPage, database, { role: "doctor", tenantId: tenant.id });
  const adminPage = await openSecondSession(browser);
  const admin = await enterClinicAs(adminPage, database, { role: "clinic-admin", tenantId: tenant.id });

  return { clinicName, tenant, doctor, admin, adminPage };
}

const memberRow = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });

test("desactivar a un médico con su sesión abierta le quita el acceso, y reactivarlo se lo devuelve", async ({ page, browser }) => {
  const { clinicName, adminPage } = await seedClinicWithDoctorAndAdmin(browser, page);
  await expect(page.getByRole("banner")).toContainText(clinicName);

  await adminPage.goto("/clinic/staff");
  await memberRow(adminPage, "Cardiología").getByRole("button", { name: "Desactivar" }).click();
  await expect(adminPage.getByText(/Desactivamos a la persona/)).toBeVisible();
  await expect(memberRow(adminPage, "Cardiología")).toContainText("Desactivado");

  // La sesión del médico sigue abierta, pero en su siguiente operación ya no tiene la clínica.
  await page.reload();
  await expect(page).toHaveURL(/\/no-access$/);

  await memberRow(adminPage, "Cardiología").getByRole("button", { name: "Reactivar" }).click();
  await expect(adminPage.getByText(/Reactivamos a la persona/)).toBeVisible();
  await expect(memberRow(adminPage, "Cardiología")).toContainText("Activo");

  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText(clinicName);

  await adminPage.context().close();
});

test("el paciente ve el aviso, la asignación se termina y se reasigna conservando el historial", async ({ page, browser }) => {
  const clinicName = uniqueName("Clínica de reasignación");
  const tenant = await database.seedTenant(clinicName);
  const patient = await enterClinicAs(page, database, { role: "patient", tenantId: tenant.id });

  const adminPage = await openSecondSession(browser);
  const firstDoctor = await enterClinicAs(adminPage, database, { role: "doctor", tenantId: tenant.id });
  await adminPage.context().clearCookies();
  await enterClinicAs(adminPage, database, { role: "doctor", tenantId: tenant.id });
  await adminPage.context().clearCookies();
  const admin = await enterClinicAs(adminPage, database, { role: "clinic-admin", tenantId: tenant.id });
  await database.assignDoctor({
    tenantId: tenant.id,
    membershipId: firstDoctor.relationshipId,
    patientId: patient.relationshipId,
    createdByUserId: admin.user.id,
  });

  await page.goto("/studies");
  await expect(page.getByText(DOCTOR_UNAVAILABLE)).toHaveCount(0);

  // Se desactiva al médico asignado: la asignación sigue vigente, pero el paciente se queda sin quién lo atienda.
  await adminPage.goto("/clinic/staff");
  await memberRow(adminPage, firstDoctor.email).getByRole("button", { name: "Desactivar" }).click();
  await expect(adminPage.getByText(/Desactivamos a la persona/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(DOCTOR_UNAVAILABLE)).toBeVisible();

  // El administrador ve la asignación vigente con el médico desactivado, y la termina.
  await adminPage.goto("/clinic/patients");
  await expect(adminPage.getByText(/Desactivado: el paciente no tiene quién lo atienda/)).toBeVisible();
  await adminPage.getByRole("button", { name: "Terminar asignación" }).click();
  await expect(adminPage.getByText("Sin médico asignado")).toBeVisible();

  // Reasigna: la lista solo ofrece médicos activos, así que queda el segundo.
  await adminPage.getByRole("button", { name: "Asignar médico" }).click();
  await adminPage.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(adminPage.getByText(/^Médico: /)).toBeVisible();

  await page.reload();
  await expect(page.getByText(DOCTOR_UNAVAILABLE)).toHaveCount(0);

  await adminPage.context().close();
});

test("no se puede desactivar al único administrador", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica con un administrador"));
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  await page.goto("/clinic/staff");
  await memberRow(page, /administrador/).getByRole("button", { name: "Desactivar" }).click();

  await expect(page.getByText(LAST_ADMIN)).toBeVisible();
  await expect(memberRow(page, /administrador/)).toContainText("Activo");
});
