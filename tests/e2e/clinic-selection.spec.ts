import { expect, test, type Page } from "@playwright/test";

import {
  E2E_PASSWORD as PASSWORD,
  FAKE_CODE,
  createVerifiedAccount as createAccount,
  signIn,
} from "../support/e2e-accounts";
import { createE2eDatabase, uniqueEmail, uniqueName, type E2eDatabase } from "../support/e2e-database";

const INVALID_CREDENTIALS = "El correo o la contraseña no son correctos.";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

function createVerifiedAccount(page: Page) {
  return createAccount(page, database);
}

test("(a) una cuenta nueva sin clínicas ve el estado vacío con la explicación de la invitación", async ({
  page,
}) => {
  const email = uniqueEmail("nueva");

  await page.goto("/sign-up");
  await page.getByLabel("Nombre completo").fill(uniqueName("Nueva"));
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Código de verificación").fill(FAKE_CODE);
  await page.getByLabel("Elegí tu contraseña").fill(PASSWORD);
  await page.getByLabel("Repetí tu contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Verificar correo" }).click();

  await expect(page.getByText("Tu cuenta quedó verificada. Ya podés ingresar.")).toBeVisible();

  await signIn(page, email);

  await expect(page).toHaveURL(/\/no-access$/);
  await expect(page.getByText(/necesitás una invitación de una clínica/)).toBeVisible();
});

test("(b) con una sola clínica entra directo al inicio y la muestra", async ({ page }) => {
  const { user, email } = await createVerifiedAccount(page);
  const tenantName = uniqueName("Clínica única");
  const tenant = await database.seedTenant(tenantName);
  await database.linkAsClinicAdmin({ userId: user.id, tenantId: tenant.id });

  await signIn(page, email);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(tenantName);
  await expect(page.getByRole("main")).toContainText(tenantName);
});

test("(c) con varias clínicas elige una y cambia a otra desde el encabezado", async ({ page }) => {
  const { user, email } = await createVerifiedAccount(page);
  const nameA = uniqueName("Clínica Alfa");
  const nameB = uniqueName("Clínica Beta");
  const [tenantA, tenantB] = await Promise.all([database.seedTenant(nameA), database.seedTenant(nameB)]);
  await database.linkAsClinicAdmin({ userId: user.id, tenantId: tenantA.id });
  await database.linkAsLinkedPatient({
    userId: user.id,
    tenantId: tenantB.id,
    documentNumber: `${Date.now()}`.slice(-8),
  });

  await signIn(page, email);

  await expect(page).toHaveURL(/\/select-clinic$/);
  await page.getByRole("button", { name: new RegExp(nameA) }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(nameA);

  await page.getByRole("link", { name: "Cambiar de clínica" }).click();
  await expect(page).toHaveURL(/\/select-clinic$/);
  await page.getByRole("button", { name: new RegExp(nameB) }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(nameB);
  await expect(page.getByRole("banner")).not.toContainText(nameA);
});

test("(d) sin sesión, el inicio lleva al ingreso y después vuelve; un destino externo se ignora", async ({
  page,
}) => {
  const { user, email } = await createVerifiedAccount(page);
  const tenant = await database.seedTenant(uniqueName("Clínica destino"));
  await database.linkAsClinicAdmin({ userId: user.id, tenantId: tenant.id });

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();

  for (const external of ["https%3A%2F%2Fexample.com%2Frobo", "%2F%2Fexample.com"]) {
    await page.context().clearCookies();
    await page.goto(`/sign-in?next=${external}`);
    await signIn(page, email);

    await expect(page).toHaveURL(/localhost:3000\/$/);
  }
});

test("(e) si la clínica se suspende con la sesión abierta, el siguiente pedido ya no la ofrece", async ({
  page,
}) => {
  const { user, email } = await createVerifiedAccount(page);
  const tenant = await database.seedTenant(uniqueName("Clínica a suspender"));
  await database.linkAsClinicAdmin({ userId: user.id, tenantId: tenant.id });

  await signIn(page, email);
  await expect(page).toHaveURL(/\/$/);

  await database.setTenantStatus(tenant.id, "SUSPENDED");
  await page.reload();

  await expect(page).toHaveURL(/\/no-access$/);
});

test("(f) el mensaje es el mismo para un correo inexistente y para una contraseña incorrecta", async ({
  page,
}) => {
  const { email } = await createVerifiedAccount(page);

  // Next agrega su propio anunciador de rutas con rol `alert`: se acota al formulario.
  const formAlert = page.locator("form").getByRole("alert");

  await signIn(page, email, "contraseña-equivocada-1");
  await expect(formAlert).toHaveText(INVALID_CREDENTIALS);

  await signIn(page, uniqueEmail("inexistente"));
  await expect(formAlert).toHaveText(INVALID_CREDENTIALS);
});

test("(g) con sesión vigente, /sign-in lleva a la clínica; sin sesión ofrece verificar el correo", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("link", { name: "¿No verificaste tu correo?" })).toBeVisible();

  const { user, email } = await createVerifiedAccount(page);
  const tenant = await database.seedTenant(uniqueName("Clínica abierta"));
  await database.linkAsClinicAdmin({ userId: user.id, tenantId: tenant.id });
  await signIn(page, email);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/sign-in");

  await expect(page).toHaveURL(/\/$/);
});
