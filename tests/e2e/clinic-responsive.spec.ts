import { expect, test, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";

// Las pantallas de administración se prueban en los tres anchos y los dos esquemas de color dentro de una sola
// ejecución (el viewport se fija acá), así que corre solo en el proyecto de escritorio.
test.beforeEach(({ page }, testInfo) => {
  void page;
  test.skip(testInfo.project.name !== "desktop", "Fija sus propios anchos de pantalla.");
});

const WIDTHS = [375, 768, 1280] as const;
const SCHEMES = ["light", "dark"] as const;
const LONG_EMAIL = `una.direccion.de.correo.bastante.larga.para.probar.desbordes.${Date.now()}@example-con-dominio-largo.com`;

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function focusedOutlineIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);

    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
  });
}

// Tabula hasta que el foco llega al elemento que cumple el selector (con un tope, para no quedar en un ciclo).
async function tabTo(page: Page, selector: string, maxTabs = 40) {
  for (let step = 0; step < maxTabs; step += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((css) => document.activeElement?.matches(css) ?? false, selector)) {
      return;
    }
  }
  throw new Error(`El foco no llegó a ${selector} con el teclado.`);
}

// Una clínica con un administrador (la sesión de `page`), un médico, una invitación pendiente de correo largo y un
// paciente pendiente, para que todas las listas tengan contenido que pueda desbordar.
async function seedClinic(page: Page) {
  const tenant = await database.seedTenant(uniqueName("Clínica responsive de administración"));
  const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId: tenant.id });
  await page.context().clearCookies();
  await enterClinicAs(page, database, { role: "clinic-admin", tenantId: tenant.id });

  await page.goto("/clinic/staff");
  await page.getByRole("button", { name: "Invitar personal" }).click();
  await page.getByLabel("Correo electrónico").fill(LONG_EMAIL);
  await page.getByRole("checkbox", { name: "Administrador" }).check();
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByText("Listo, enviamos la invitación.")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ventana" }).click();

  await page.goto("/clinic/patients");
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  await page.getByLabel("Número de documento").fill(`${Date.now()}`.slice(-9));
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await expect(page.getByText(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/)).toBeVisible();

  return { doctor };
}

test("las pantallas de administración se adaptan a tres anchos y a los dos esquemas de color", async ({ page }) => {
  // Recorre 6 pantallas × 2 esquemas × 3 anchos: necesita más que el tiempo por defecto.
  test.setTimeout(120_000);
  await seedClinic(page);
  const screens = [
    { name: "Personal", path: "/clinic/staff" },
    // La pestaña de invitaciones muestra el correo largo de la siembra.
    { name: "Personal de la clínica", path: "/clinic/staff?vista=invitaciones" },
    { name: "Pacientes de la clínica", path: "/clinic/patients" },
    { name: "Vincular mi cuenta", path: "/link-patient" },
    { name: "Invitación a una clínica", path: "/invitation/un-token-cualquiera" },
  ];

  for (const screen of screens) {
    for (const scheme of SCHEMES) {
      for (const width of WIDTHS) {
        const label = `${screen.name} · ${scheme} · ${width} px`;
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(screen.path);
        await expect(page.getByRole("heading", { level: 1, name: screen.name }), label).toBeVisible();

        expect(await hasNoHorizontalScroll(page), `${label}: desplazamiento horizontal`).toBe(true);
      }
    }
  }
});

test("los estados se dicen con texto además de color", async ({ page }) => {
  await seedClinic(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/clinic/staff");
  const doctorRow = page.getByRole("listitem").filter({ hasText: "Cardiología" });
  await expect(doctorRow).toContainText("Activo");
  await page.goto("/clinic/staff?vista=invitaciones");
  await expect(page.getByRole("listitem").filter({ hasText: LONG_EMAIL })).toContainText(/Vence el/);
  await page.goto("/clinic/staff");

  await doctorRow.getByRole("button", { name: "Desactivar" }).click();
  await expect(doctorRow).toContainText("Desactivado");
  // El aviso de éxito es un texto con ícono dentro de un estado, no solo un color.
  const notice = page.getByRole("status").filter({ hasText: "Desactivamos a la persona" });
  await expect(notice.locator("svg")).toBeVisible();

  await page.goto("/clinic/patients");
  await expect(page.getByText(/Pendiente de vincular · Código vigente/)).toBeVisible();
  await expect(page.getByText("Sin médico asignado")).toBeVisible();
});

test("invitar y vincular se completan con el teclado, con foco visible", async ({ page }) => {
  await seedClinic(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/clinic/staff");
  // La lista llega por streaming: se espera al botón que abre el formulario antes de usar el teclado.
  await expect(page.getByRole("button", { name: "Invitar personal" })).toBeVisible();
  await tabTo(page, "button[aria-haspopup='dialog']");
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await page.keyboard.press("Enter");
  // El modal lleva el foco a su primer campo.
  await expect(page.locator("#invite-email")).toBeFocused();
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await page.keyboard.type(`teclado.${Date.now()}@example.com`);

  await tabTo(page, "input[name='isClinicAdmin']");
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await page.keyboard.press("Space");

  await tabTo(page, "form button[type='submit']");
  await expect(page.getByRole("button", { name: "Enviar invitación" })).toBeFocused();
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Listo, enviamos la invitación.")).toBeVisible();

  await page.goto("/link-patient");
  await expect(page.getByRole("button", { name: "Vincular mi cuenta" })).toBeVisible();
  await tabTo(page, "#link-document-type");
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await tabTo(page, "#link-document-number");
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await tabTo(page, "#link-code");
  expect(await focusedOutlineIsVisible(page)).toBe(true);
  await tabTo(page, "form button[type='submit']");
  await expect(page.getByRole("button", { name: "Vincular mi cuenta" })).toBeFocused();
  expect(await focusedOutlineIsVisible(page)).toBe(true);
});
