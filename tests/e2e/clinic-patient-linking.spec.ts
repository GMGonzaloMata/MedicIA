import { expect, test, type Page } from "@playwright/test";

import { createVerifiedAccount, enterClinicAs, signIn } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";

const CODE_PATTERN = /^[A-Z0-9]{5}-[A-Z0-9]{5}$/;
const LINK_FAILED = "No pudimos vincular tu cuenta con esos datos. Revisá el documento y el código, o pedile a tu clínica un código nuevo.";
const WRONG_CODE = "ZZZZZ-ZZZZZ";

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

// Un formulario a la vez: Next agrega su propio anunciador de rutas con rol `alert`.
const formAlert = (page: Page) => page.locator("form").getByRole("alert");

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await signIn(page, email);
  // Sin esperar, el goto siguiente interrumpe el ingreso y vuelve a /sign-in.
  await expect(page).not.toHaveURL(/\/sign-in/);
}

// Como administrador de la clínica, registra un paciente y devuelve su documento y el código que se muestra una vez.
async function registerPatientAsAdmin(page: Page, tenantId: string) {
  const admin = await enterClinicAs(page, database, { role: "clinic-admin", tenantId });
  const number = documentNumber();

  await page.goto("/clinic/patients");
  await page.getByLabel("Número de documento").fill(number);
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  const code = (await page.getByText(CODE_PATTERN).textContent()) ?? "";

  return { adminEmail: admin.email, number, code };
}

async function fillAndLink(page: Page, number: string, code: string) {
  await page.goto("/link-patient");
  await page.getByLabel("Número de documento").fill(number);
  await page.getByLabel("Código de vinculación").fill(code);
  await page.getByRole("button", { name: "Vincular mi cuenta" }).click();
}

test("el paciente se vincula con su documento y el código, y ve la clínica", async ({ page }) => {
  const clinicName = uniqueName("Clínica de vinculación");
  const tenant = await database.seedTenant(clinicName);
  const person = await createVerifiedAccount(page, database);
  const { number, code } = await registerPatientAsAdmin(page, tenant.id);

  await signInAs(page, person.email);
  await expect(page).toHaveURL(/\/no-access$/);
  await page.getByRole("link", { name: /vinculá tu cuenta/ }).click();
  await expect(page).toHaveURL(/\/link-patient$/);
  await page.getByLabel("Número de documento").fill(number);
  await page.getByLabel("Código de vinculación").fill(code);
  await page.getByRole("button", { name: "Vincular mi cuenta" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(clinicName);
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Mis estudios" })).toBeVisible();

  // El código se usa una sola vez: otra cuenta no puede reutilizarlo.
  const other = await (async () => {
    await page.context().clearCookies();
    return createVerifiedAccount(page, database);
  })();
  await signInAs(page, other.email);
  await fillAndLink(page, number, code);
  await expect(formAlert(page)).toHaveText(LINK_FAILED);
});

test("el mensaje es el mismo con un documento incorrecto y con un código incorrecto", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica de mensajes"));
  const person = await createVerifiedAccount(page, database);
  const { number } = await registerPatientAsAdmin(page, tenant.id);

  await signInAs(page, person.email);
  await fillAndLink(page, documentNumber(), WRONG_CODE);
  await expect(formAlert(page)).toHaveText(LINK_FAILED);

  await fillAndLink(page, number, WRONG_CODE);
  await expect(formAlert(page)).toHaveText(LINK_FAILED);
});

test("al quinto fallo el código se bloquea y la clínica genera uno nuevo", async ({ page }) => {
  const clinicName = uniqueName("Clínica de bloqueo");
  const tenant = await database.seedTenant(clinicName);
  const person = await createVerifiedAccount(page, database);
  const { adminEmail, number, code } = await registerPatientAsAdmin(page, tenant.id);

  await signInAs(page, person.email);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await fillAndLink(page, number, WRONG_CODE);
    await expect(formAlert(page)).toHaveText(LINK_FAILED);
  }

  // Con el código bloqueado, ni el correcto sirve.
  await fillAndLink(page, number, code);
  await expect(formAlert(page)).toHaveText(LINK_FAILED);

  await signInAs(page, adminEmail);
  await page.goto("/clinic/patients");
  await expect(page.getByText(/Código bloqueado/)).toBeVisible();
  await page.getByRole("button", { name: "Generar código nuevo" }).click();
  const renewed = (await page.getByText(CODE_PATTERN).textContent()) ?? "";
  expect(renewed).not.toBe(code);

  await signInAs(page, person.email);
  await fillAndLink(page, number, renewed);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(clinicName);
});

test("una persona en dos clínicas las ve al elegir y no mezcla datos", async ({ page }) => {
  const nameA = uniqueName("Clínica Alfa");
  const nameB = uniqueName("Clínica Beta");
  const [tenantA, tenantB] = await Promise.all([database.seedTenant(nameA), database.seedTenant(nameB)]);
  const person = await createVerifiedAccount(page, database);
  await database.linkAsLinkedPatient({ userId: person.user.id, tenantId: tenantA.id, documentNumber: documentNumber() });
  const { number, code } = await registerPatientAsAdmin(page, tenantB.id);

  await signInAs(page, person.email);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(nameA);

  await fillAndLink(page, number, code);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(nameB);
  await expect(page.getByRole("banner")).not.toContainText(nameA);

  await page.getByRole("link", { name: "Cambiar de clínica" }).click();
  await expect(page.getByRole("button", { name: new RegExp(nameA) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(nameB) })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(nameA) }).click();
  await expect(page.getByRole("banner")).toContainText(nameA);
  await expect(page.getByRole("banner")).not.toContainText(nameB);
});
