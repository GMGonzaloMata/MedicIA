import { expect, test, type Page } from "@playwright/test";

import { createVerifiedAccount, enterClinicAs, signIn } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { readInvitationPath } from "../support/e2e-mail";

const INVALID_INVITATION = /Esta invitación no es válida/;

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

// Invita desde «Personal» a un médico con sus datos y espera el aviso de envío.
async function inviteDoctor(page: Page, email: string) {
  await page.goto("/clinic/staff");
  await page.getByRole("button", { name: "Invitar personal" }).click();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("checkbox", { name: "Médico" }).check();
  await page.getByLabel("Especialidad").fill("Cardiología");
  await page.getByLabel("Matrícula").fill(`MP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("Listo, enviamos la invitación.")).toBeVisible();
  // El formulario está en un modal: se cierra para volver a la lista.
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
}

// Cierra la sesión actual y entra con otra cuenta que todavía no tiene clínica.
async function switchTo(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/no-access$/);
}

test("el administrador invita a un médico, que acepta con el enlace y queda en la clínica", async ({ page }) => {
  const clinicName = uniqueName("Clínica invitante");
  const tenant = await database.seedTenant(clinicName);
  const invitee = await createVerifiedAccount(page, database);
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  await inviteDoctor(page, invitee.email);
  // La invitación aparece en su pestaña, con el contador actualizado.
  await page.getByRole("link", { name: /Invitaciones pendientes/ }).click();
  await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toBeVisible();
  await expect(page.getByText(invitee.email)).toBeVisible();

  const link = await readInvitationPath(invitee.email);

  await switchTo(page, invitee.email);
  await page.goto(link);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(clinicName);
  await expect(
    page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Mis pacientes" }),
  ).toBeVisible();

  // La invitación se usa una sola vez.
  await page.goto(link);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page.getByText(INVALID_INVITATION)).toBeVisible();
});

test("una cuenta con otro correo no puede usar la invitación", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica privada"));
  const invited = await createVerifiedAccount(page, database);
  const other = await createVerifiedAccount(page, database);
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  await inviteDoctor(page, invited.email);
  const link = await readInvitationPath(invited.email);

  await switchTo(page, other.email);
  await page.goto(link);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();

  await expect(page.getByText(INVALID_INVITATION)).toBeVisible();
  await expect(page).toHaveURL(/\/invitation\//);
});

test("una invitación anulada deja de servir", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica que anula"));
  const invited = await createVerifiedAccount(page, database);
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  await inviteDoctor(page, invited.email);
  const link = await readInvitationPath(invited.email);

  // Las invitaciones están en su propia pestaña.
  await page.getByRole("link", { name: /Invitaciones pendientes/ }).click();
  await page.getByRole("button", { name: "Anular" }).click();
  // La invitación sale de la lista de pendientes.
  await expect(page.getByText(invited.email)).toHaveCount(0);

  await switchTo(page, invited.email);
  await page.goto(link);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();

  await expect(page.getByText(INVALID_INVITATION)).toBeVisible();
});

test("un médico que no administra no ve el formulario de invitaciones", async ({ page }) => {
  const tenant = await database.seedTenant(uniqueName("Clínica con médico"));
  await enterClinicAs(page, database, { role: "doctor", tenantId: tenant.id });

  await page.goto("/clinic/staff");

  await expect(page.getByText(/No tenés permiso para hacer esto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar invitación" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Personal" })).toHaveCount(0);
});
