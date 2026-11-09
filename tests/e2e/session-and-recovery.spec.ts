import { expect, test, type Page } from "@playwright/test";

import {
  E2E_PASSWORD,
  FAKE_CODE,
  createVerifiedAccount as createAccount,
  signIn,
} from "../support/e2e-accounts";
import { createE2eDatabase, uniqueEmail, uniqueName, type E2eDatabase } from "../support/e2e-database";

const NEW_PASSWORD = "Contraseña-nueva-456";
const INVALID_CODE = "El código no es correcto o ya venció.";
const RECOVERY_MESSAGE = "Si existe una cuenta con ese correo, te enviamos un código para restablecer la contraseña.";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

// Una cuenta verificada con una clínica, ya dentro de la aplicación.
async function signedInAccount(page: Page) {
  const { user, email } = await createAccount(page, database);
  const tenant = await database.seedTenant(uniqueName("Clínica sesión"));
  await database.linkAsClinicAdmin({ userId: user.id, tenantId: tenant.id });

  await signIn(page, email);
  await expect(page.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();

  return { user, email };
}

async function requestRecovery(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByRole("button", { name: "Cambiar contraseña" })).toBeVisible();
}

test("(a) cerrar sesión lleva al ingreso y el inicio deja de abrirse", async ({ page }) => {
  await signedInAccount(page);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
});

test("(b) recuperar la contraseña invalida la sesión abierta en otro navegador y la anterior", async ({
  page,
  browser,
}) => {
  const { email } = await signedInAccount(page);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/sign-in");
  await signIn(otherPage, email);
  await expect(otherPage.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();

  const recovery = await browser.newContext();
  const recoveryPage = await recovery.newPage();
  await requestRecovery(recoveryPage, email);
  await recoveryPage.getByLabel("Código de verificación").fill(FAKE_CODE);
  await recoveryPage.getByLabel("Contraseña nueva").fill(NEW_PASSWORD);
  await recoveryPage.getByLabel("Repetí la contraseña").fill(NEW_PASSWORD);
  await recoveryPage.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(recoveryPage.getByText("Cambiaste tu contraseña. Ingresá con la nueva.")).toBeVisible();

  // Las dos sesiones que estaban abiertas dejan de valer.
  for (const session of [page, otherPage]) {
    await session.goto("/");
    await expect(session).toHaveURL(/\/sign-in/);
  }

  await signIn(recoveryPage, email, E2E_PASSWORD);
  await expect(recoveryPage.locator("form").getByRole("alert")).toBeVisible();
  await signIn(recoveryPage, email, NEW_PASSWORD);
  await expect(recoveryPage.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();

  await other.close();
  await recovery.close();
});

test("(c) un código incorrecto no cambia nada", async ({ page }) => {
  const { email } = await createAccount(page, database);

  await requestRecovery(page, email);
  await page.getByLabel("Código de verificación").fill("999999");
  await page.getByLabel("Contraseña nueva").fill(NEW_PASSWORD);
  await page.getByLabel("Repetí la contraseña").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID_CODE);

  await page.goto("/sign-in");
  await signIn(page, email, E2E_PASSWORD);
  await expect(page.getByRole("heading", { level: 1, name: "Todavía no tenés acceso a una clínica" })).toBeVisible();
});

test("(d) el mensaje de recuperación es el mismo exista o no el correo", async ({ page }) => {
  const { email } = await createAccount(page, database);

  await requestRecovery(page, email);
  await expect(page.getByRole("status")).toHaveText(RECOVERY_MESSAGE);

  await requestRecovery(page, uniqueEmail("inexistente"));
  await expect(page.getByRole("status")).toHaveText(RECOVERY_MESSAGE);
});

test("(e) vencer la inactividad lleva al ingreso", async ({ page }) => {
  const { user } = await signedInAccount(page);

  await database.ageSessions({ userId: user.id, minutes: 31 });
  await page.reload();

  await expect(page).toHaveURL(/\/sign-in/);
});
