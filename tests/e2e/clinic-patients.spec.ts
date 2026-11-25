import { expect, test, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";

const CODE_PATTERN = /^[A-Z0-9]{5}-[A-Z0-9]{5}$/;

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

function documentNumber(): string {
  return `${Date.now()}${Math.floor(Math.random() * 10)}`.slice(-9);
}

// Deja a un médico en la clínica y entra como administrador de la misma, que no es médico.
async function enterAsAdminOfClinicWithDoctor(page: Page) {
  const tenant = await database.seedTenant(uniqueName("Clínica de pacientes"));
  await enterClinicAs(page, database, { role: "doctor", tenantId: tenant.id });
  await page.context().clearCookies();
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  return tenant;
}

// El formulario está en el modal «Nuevo paciente»; si ya quedó abierto de un registro anterior, se reusa.
async function registerPatient(page: Page, number: string) {
  if (!(await page.getByRole("button", { name: "Registrar paciente" }).isVisible())) {
    await page.getByRole("button", { name: "Nuevo paciente" }).click();
  }
  await page.getByLabel("Tipo de documento").selectOption("DNI");
  await page.getByLabel("Número de documento").fill(number);
  await page.getByRole("button", { name: "Registrar paciente" }).click();
}

test("el administrador registra un paciente y ve el código una sola vez", async ({ page }) => {
  await enterAsAdminOfClinicWithDoctor(page);
  await page.goto("/clinic/patients");
  const number = documentNumber();

  await registerPatient(page, number);

  const code = page.getByText(CODE_PATTERN);
  await expect(code).toBeVisible();
  await expect(page.getByText(/No se puede volver a ver/)).toBeVisible();
  const shown = (await code.textContent()) ?? "";

  await expect(page.getByText(number)).toBeVisible();
  await expect(page.getByText(/Pendiente de vincular · Código vigente/)).toBeVisible();

  // Después de recargar el código no vuelve a mostrarse en ninguna parte.
  await page.reload();
  await expect(page.getByText(number)).toBeVisible();
  await expect(page.getByText(CODE_PATTERN)).toHaveCount(0);
  expect(await page.content()).not.toContain(shown);
});

test("un documento repetido se rechaza con el siguiente paso", async ({ page }) => {
  await enterAsAdminOfClinicWithDoctor(page);
  await page.goto("/clinic/patients");
  const number = documentNumber();

  await registerPatient(page, number);
  await expect(page.getByText(CODE_PATTERN)).toBeVisible();
  await registerPatient(page, number);

  await expect(page.getByText("Ya hay un paciente registrado con ese documento en la clínica.")).toBeVisible();
});

test("generar un código nuevo muestra otro y el estado sigue vigente", async ({ page }) => {
  await enterAsAdminOfClinicWithDoctor(page);
  await page.goto("/clinic/patients");

  await registerPatient(page, documentNumber());
  const first = (await page.getByText(CODE_PATTERN).textContent()) ?? "";
  await page.reload();
  await page.getByRole("button", { name: "Generar código nuevo" }).click();
  await page.getByRole("button", { name: "Generar código", exact: true }).click();

  await expect(page.getByText(CODE_PATTERN)).toBeVisible();
  expect(await page.getByText(CODE_PATTERN).textContent()).not.toBe(first);
  await expect(page.getByText("Generamos un código nuevo y el anterior dejó de servir.")).toBeVisible();
});

test("el administrador asigna el paciente a un médico de la clínica", async ({ page }) => {
  await enterAsAdminOfClinicWithDoctor(page);
  await page.goto("/clinic/patients");
  await registerPatient(page, documentNumber());
  await expect(page.getByText(CODE_PATTERN)).toBeVisible();
  await page.reload();

  await expect(page.getByText("Sin médico asignado")).toBeVisible();
  await page.getByRole("button", { name: "Asignar médico" }).click();
  await page.getByRole("button", { name: "Asignar", exact: true }).click();

  await expect(page.getByText(/^Médico: /)).toBeVisible();
  await expect(page.getByText("Sin médico asignado")).toHaveCount(0);

  // Asignarlo otra vez al mismo médico se rechaza.
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByText("Ese paciente ya está asignado a ese médico.")).toBeVisible();
});

test("un administrador que no es médico no accede a los estudios", async ({ page }) => {
  await enterAsAdminOfClinicWithDoctor(page);

  await page.goto("/patients");

  await expect(page.getByText("Tu vínculo con la clínica no incluye estudios.")).toBeVisible();
});

test("un médico no ve las pantallas de administración de pacientes", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica con médico"));
  await enterClinicAs(page, database, { role: "doctor", tenantId: tenant.id });

  await page.goto("/clinic/patients");

  await expect(page.getByText(/No tenés permiso para hacer esto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar paciente" })).toHaveCount(0);
});
