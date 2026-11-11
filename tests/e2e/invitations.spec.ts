import { expect, test, type Browser, type Page } from "@playwright/test";

import { createVerifiedAccount, enterClinicAs, registerAccount, signIn } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueEmail, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { invitationLinksFor, waitForInvitationLink } from "../support/e2e-mail";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

const GENERIC_INVALID = "Esta invitación no es válida o venció.";
const DOCUMENT = "30111222";

// Un contexto de navegador nuevo, sin sesión ni cookies: otra persona en otra computadora.
async function newPerson(browser: Browser) {
  const context = await browser.newContext();

  return { context, page: await context.newPage() };
}

async function adminInClinic(page: Page, clinicLabel: string) {
  const tenantId = (await database.seedTenant(uniqueName(clinicLabel))).id;
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId });

  return tenantId;
}

async function inviteDoctor(page: Page, email: string, license: string) {
  await page.goto("/invitations");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Matrícula").fill(license);
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByText(`Enviamos la invitación a ${email}.`)).toBeVisible();
}

async function invitePatient(page: Page, email: string, documentNumber: string, { asAdmin }: { asAdmin: boolean }) {
  await page.goto("/invitations");

  if (asAdmin) {
    await page.getByLabel("Tipo de vínculo").selectOption("PATIENT");
  }

  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Número de documento").fill(documentNumber);
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByText(`Enviamos la invitación a ${email}.`)).toBeVisible();
}

// La persona abre el link del correo sin sesión y llega a ingresar; con una cuenta nueva, antes la crea.
async function openLinkAndSignIn(page: Page, link: string, email: string, { register }: { register?: string } = {}) {
  await page.goto(link);
  await expect(page).toHaveURL(/\/sign-in\?next=%2Finvitation$/);
  await expect(page.getByText("Ingresá o creá tu cuenta con el correo al que llegó la invitación.")).toBeVisible();

  if (register) {
    await registerAccount(page, { email, fullName: register });
  }

  await signIn(page, email);
  await expect(page).toHaveURL(/\/invitation$/);
}

async function acceptAsDoctor(page: Page, license: string, specialty = "Cardiología") {
  await page.getByLabel("Matrícula").fill(license);
  await page.getByLabel("Especialidad").fill(specialty);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
}

async function acceptAsPatient(page: Page, documentNumber: string) {
  await page.getByLabel("Número de documento").fill(documentNumber);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
}

test("(US1) el administrador invita a un médico por correo y la persona queda vinculada con su matrícula", async ({
  page,
  browser,
}) => {
  await adminInClinic(page, "Clínica invita médico");
  const email = uniqueEmail("medico-nuevo");
  const license = `MN-${Date.now()}`;

  await inviteDoctor(page, email, license);

  // El link nunca se muestra en pantalla: lo recibe la persona por correo.
  await expect(page.locator("body")).not.toContainText("/invite/");
  const link = await waitForInvitationLink(email);
  expect(link).toContain("/invite/");

  const person = await newPerson(browser);
  await openLinkAndSignIn(person.page, link, email, { register: uniqueName("Dra. Nueva") });
  await expect(person.page.getByRole("heading", { level: 2, name: /te invitó como médico/ })).toBeVisible();
  await acceptAsDoctor(person.page, license.toLowerCase());

  await expect(person.page).toHaveURL(/\/$/);
  await expect(person.page.getByRole("link", { name: "Mis pacientes" }).first()).toBeVisible();

  // El mismo link no sirve una segunda vez.
  await person.page.goto(link);
  await expect(person.page.getByText(GENERIC_INVALID)).toBeVisible();
  await person.context.close();
});

test("(US1) con una matrícula distinta no se vincula y avisa cuántos intentos quedan", async ({ page, browser }) => {
  await adminInClinic(page, "Clínica matrícula incorrecta");
  const email = uniqueEmail("medico-error");
  await inviteDoctor(page, email, "MN-CORRECTA");
  const link = await waitForInvitationLink(email);

  const person = await newPerson(browser);
  await openLinkAndSignIn(person.page, link, email, { register: uniqueName("Dr. Error") });

  await acceptAsDoctor(person.page, "MN-OTRA");

  await expect(person.page.getByText("Los datos no coinciden. Te quedan 4 intentos.")).toBeVisible();
  await expect(person.page).toHaveURL(/\/invitation$/);
  await person.context.close();
});

test("(US2) el administrador invita a un paciente con cuenta: un documento distinto no vincula y el correcto sí, sin médico", async ({
  page,
  browser,
}) => {
  await adminInClinic(page, "Clínica invita paciente");
  const person = await newPerson(browser);
  const { email } = await createVerifiedAccount(person.page, database);

  await invitePatient(page, email, DOCUMENT, { asAdmin: true });
  const link = await waitForInvitationLink(email);

  await person.page.goto(link);
  await signIn(person.page, email);
  await expect(person.page).toHaveURL(/\/invitation$/);
  await expect(person.page.getByRole("heading", { level: 2, name: /te invitó como paciente/ })).toBeVisible();

  await acceptAsPatient(person.page, "99999999");
  await expect(person.page.getByText("Los datos no coinciden. Te quedan 4 intentos.")).toBeVisible();

  await acceptAsPatient(person.page, "30.111.222");
  await expect(person.page).toHaveURL(/\/$/);
  await expect(person.page.getByText(/como paciente/).first()).toBeVisible();
  await expect(person.page.getByRole("link", { name: "Mis estudios" }).first()).toBeVisible();
  await person.context.close();
});

test("(US2) cinco documentos incorrectos invalidan el link", async ({ page, browser }) => {
  await adminInClinic(page, "Clínica cinco intentos");
  const person = await newPerson(browser);
  const { email } = await createVerifiedAccount(person.page, database);
  await invitePatient(page, email, DOCUMENT, { asAdmin: true });
  const link = await waitForInvitationLink(email);

  await person.page.goto(link);
  await signIn(person.page, email);

  for (const left of ["Te quedan 4 intentos.", "Te quedan 3 intentos.", "Te quedan 2 intentos.", "Te queda 1 intento."]) {
    await acceptAsPatient(person.page, "11111111");
    await expect(person.page.getByText(`Los datos no coinciden. ${left}`)).toBeVisible();
  }

  await acceptAsPatient(person.page, "11111111");
  await expect(
    person.page.getByText("La invitación se invalidó por demasiados intentos. Pedí una nueva a la clínica."),
  ).toBeVisible();

  // Ni el documento correcto lo recupera.
  await person.page.goto(link);
  await expect(person.page.getByText(GENERIC_INVALID)).toBeVisible();
  await person.context.close();
});

test("(US3) el médico invita a un paciente nuevo y solo ese médico lo ve en su lista", async ({ page, browser }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica médico invita"))).id;
  await enterClinicAs(page, database, { role: "doctor", tenantId });
  const otherDoctor = await newPerson(browser);
  await enterClinicAs(otherDoctor.page, database, { role: "doctor", tenantId });

  // Quien solo es médico no elige el tipo: invita pacientes.
  await page.goto("/invitations");
  await expect(page.getByLabel("Tipo de vínculo")).toHaveValue("Paciente");
  await expect(page.getByRole("combobox", { name: "Tipo de vínculo" })).toHaveCount(0);
  await expect(page.getByLabel("Matrícula")).toHaveCount(0);

  const email = uniqueEmail("paciente-nuevo");
  const fullName = uniqueName("Paciente Nuevo");
  await invitePatient(page, email, DOCUMENT, { asAdmin: false });
  const link = await waitForInvitationLink(email);

  const patient = await newPerson(browser);
  await openLinkAndSignIn(patient.page, link, email, { register: fullName });
  await acceptAsPatient(patient.page, DOCUMENT);
  await expect(patient.page).toHaveURL(/\/$/);
  await patient.context.close();

  await page.goto("/patients");
  await expect(page.getByRole("link", { name: fullName })).toBeVisible();

  await otherDoctor.page.goto("/patients");
  await expect(otherDoctor.page.getByText(fullName)).toHaveCount(0);
  await otherDoctor.context.close();
});

test("(US4) un link revocado no sirve y deja de aparecer en la lista", async ({ page, browser }) => {
  await adminInClinic(page, "Clínica revoca");
  const person = await newPerson(browser);
  const { email } = await createVerifiedAccount(person.page, database);
  await inviteDoctor(page, email, "MN-REV");
  const link = await waitForInvitationLink(email);

  await page.goto("/invitations");
  const row = page.getByRole("listitem").filter({ hasText: email });
  await expect(row.getByText("Enviada")).toBeVisible();
  await row.getByRole("button", { name: `Revocar la invitación a ${email}` }).click();
  await page.getByRole("button", { name: "Revocar invitación" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: email })).toHaveCount(0);

  await person.page.goto(link);
  await signIn(person.page, email);
  await expect(person.page.getByText(GENERIC_INVALID)).toBeVisible();
  await person.context.close();
});

test("(US4) invitar dos veces al mismo correo deja que solo el segundo link sirva", async ({ page, browser }) => {
  await adminInClinic(page, "Clínica reemplaza");
  const person = await newPerson(browser);
  const { email } = await createVerifiedAccount(person.page, database);

  await inviteDoctor(page, email, "MN-DOS");
  await inviteDoctor(page, email, "MN-DOS");
  const [first, second] = await invitationLinksFor(email);
  expect(first).not.toBe(second);

  await person.page.goto(first ?? "");
  await signIn(person.page, email);
  await expect(person.page.getByText(GENERIC_INVALID)).toBeVisible();

  await person.page.goto(second ?? "");
  await expect(person.page.getByRole("heading", { level: 2, name: /te invitó como médico/ })).toBeVisible();
  await person.context.close();
});

test("(US4) si el correo no sale muestra el aviso y ofrece reintentar", async ({ page }) => {
  await adminInClinic(page, "Clínica envío fallido");

  await page.goto("/invitations");
  await page.getByLabel("Correo electrónico").fill("fail@invitations.test");
  await page.getByLabel("Matrícula").fill("MN-FALLA");
  await page.getByRole("button", { name: "Enviar invitación" }).click();

  await expect(page.getByText("No pudimos enviar el correo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "fail@invitations.test" }).getByText("Envío fallido")).toBeVisible();
});

test("(US4) una cuenta con otro correo ve el mensaje genérico, sin datos de la clínica", async ({ page, browser }) => {
  await adminInClinic(page, "Clínica privada");
  const invited = uniqueEmail("invitado");
  await inviteDoctor(page, invited, "MN-PRIV");
  const link = await waitForInvitationLink(invited);

  const stranger = await newPerson(browser);
  const { email } = await createVerifiedAccount(stranger.page, database);
  await stranger.page.goto(link);
  await signIn(stranger.page, email);

  await expect(stranger.page.getByText(GENERIC_INVALID)).toBeVisible();
  await expect(stranger.page.getByText("Si te invitaron a otro correo, cerrá sesión e ingresá con ese correo.")).toBeVisible();
  await expect(stranger.page.getByText(/Clínica privada/)).toHaveCount(0);
  await expect(stranger.page.getByText(/te invitó como/)).toHaveCount(0);
  await stranger.context.close();
});

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

// Recorre el orden de tabulación hasta llegar al campo; falla si no se puede alcanzar con el teclado.
async function reachWithKeyboard(page: Page, id: string) {
  for (let step = 0; step < 30; step += 1) {
    await page.keyboard.press("Tab");

    if (await page.evaluate((expected) => document.activeElement?.id === expected, id)) {
      return;
    }
  }

  throw new Error(`No se llegó a #${id} con el teclado.`);
}

test("(US4) las pantallas de invitaciones funcionan en tres anchos y en modo oscuro", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Fija sus propios anchos de pantalla.");

  await adminInClinic(page, "Clínica responsive");
  const person = await newPerson(browser);
  const { email } = await createVerifiedAccount(person.page, database);
  await inviteDoctor(page, email, "MN-RESP");
  await person.page.goto(await waitForInvitationLink(email));
  await signIn(person.page, email);
  await expect(person.page.getByRole("heading", { level: 2, name: /te invitó como médico/ })).toBeVisible();

  for (const scheme of ["light", "dark"] as const) {
    for (const width of [375, 768, 1280]) {
      for (const screen of [
        { page, path: "/invitations", heading: "Invitaciones pendientes", field: "invite-email" },
        { page: person.page, path: "/invitation", heading: null, field: "accept-license" },
      ]) {
        await screen.page.emulateMedia({ colorScheme: scheme });
        await screen.page.setViewportSize({ width, height: 900 });
        await screen.page.goto(screen.path);
        await expect(screen.page.locator(`#${screen.field}`)).toBeVisible();

        if (screen.heading) {
          await expect(screen.page.getByRole("heading", { name: screen.heading })).toBeVisible();
          // El estado del link se dice con texto, no solo con color.
          await expect(screen.page.getByText("Enviada").first()).toBeVisible();
        }

        expect(await hasNoHorizontalScroll(screen.page), `${screen.path} a ${width}px en modo ${scheme}`).toBe(true);
        await reachWithKeyboard(screen.page, screen.field);
        await expect(screen.page.locator(`#${screen.field}`)).toBeFocused();
      }
    }
  }

  await person.context.close();
});
