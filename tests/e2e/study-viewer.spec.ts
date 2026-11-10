import { expect, test, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { buildNpz } from "../support/npz-builder";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

const leadImages = (page: Page) => page.locator('svg[role="img"]');

async function uploadValidStudy(page: Page) {
  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "ecg-de-prueba.npz",
    mimeType: "application/octet-stream",
    buffer: buildNpz(),
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
}

// En pantallas anchas la lista es una tabla y en el móvil son tarjetas: solo uno de los dos vínculos es visible.
async function openWaveform(page: Page, number: number) {
  await page.getByRole("link", { name: `Ver onda del estudio ${number}` }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: `Estudio ${number}`, level: 1 })).toBeVisible();
}

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

test("el paciente abre su estudio, recorre el visor con el teclado y vuelve a la lista", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica visor paciente"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await uploadValidStudy(page);

  await openWaveform(page, 1);

  // Next conserva la lista anterior oculta: se busca dentro de los datos del estudio.
  await expect(page.locator("dd", { hasText: "El propio paciente" })).toBeVisible();
  await expect(leadImages(page)).toHaveCount(12);
  for (const name of ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]) {
    await expect(page.getByRole("button", { name: `Ampliar la derivación ${name}`, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/sin unidades de milivolts/)).toBeVisible();

  // La clave del archivo y la firma del formato guardado no llegan al navegador.
  const html = await page.content();
  expect(html).not.toContain(".ecg1");
  expect(html).not.toContain("MEDECG01");

  // Recorrido con teclado: ampliar una derivación, acercar, desplazar, salir con Tab y volver a las 12.
  await page.getByRole("button", { name: "Ampliar la derivación II", exact: true }).focus();
  await page.keyboard.press("Enter");
  const chart = page.getByRole("group", { name: "Gráfica de la derivación II", exact: true });
  await expect(chart).toBeVisible();
  await expect(leadImages(page)).toHaveCount(1);

  await chart.focus();
  await expect(chart).toBeFocused();
  await page.keyboard.press("+");
  await expect(page.getByText("Mostrando de 2,5 a 7,5 s")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Mostrando de 3,5 a 8,5 s")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("group", { name: "Gráfica de la derivación III", exact: true })).toBeFocused();

  // El foco no queda atrapado en la gráfica.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("group", { name: "Gráfica de la derivación III", exact: true })).not.toBeFocused();

  await page.getByRole("group", { name: "Gráfica de la derivación III", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(leadImages(page)).toHaveCount(12);

  await page.getByRole("link", { name: "Volver a mis estudios" }).click();
  await expect(page).toHaveURL(/\/studies$/);
});

test("el médico abre el estudio de un paciente asignado, ve su nombre y vuelve a la lista del paciente", async ({
  page,
  browser,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica visor médico"))).id;
  const patientName = uniqueName("Paciente visor");

  const patientContext = await browser.newContext();
  const patient = await enterClinicAs(await patientContext.newPage(), database, {
    role: "patient",
    tenantId,
    fullName: patientName,
  });
  await patientContext.close();

  const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId });
  await database.assignDoctor({
    tenantId,
    membershipId: doctor.relationshipId,
    patientId: patient.relationshipId,
    createdByUserId: doctor.user.id,
  });

  await page.goto(`/patients/${patient.relationshipId}`);
  await uploadValidStudy(page);
  await openWaveform(page, 1);

  await expect(page.locator("dd", { hasText: patientName })).toBeVisible();
  await expect(leadImages(page)).toHaveCount(12);

  await page.getByRole("link", { name: "Volver a los estudios del paciente" }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patient.relationshipId}$`));
  await expect(page.getByRole("heading", { name: `Estudios de ${patientName}` })).toBeVisible();
});

test("un estudio ajeno y un identificador inexistente se ven igual: sin datos", async ({ page, browser }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica visor acceso"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await uploadValidStudy(page);
  await openWaveform(page, 1);
  const studyPath = new URL(page.url()).pathname;

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await enterClinicAs(otherPage, database, { role: "patient", tenantId });

  for (const path of [studyPath, "/studies/00000000-0000-4000-8000-ffffffffffff", "/studies/no-es-un-uuid"]) {
    await otherPage.goto(path);
    await expect(otherPage.getByText("No tenés acceso a este estudio.")).toBeVisible();
    await expect(leadImages(otherPage)).toHaveCount(0);
    await expect(otherPage.getByRole("heading", { name: "Estudio 1" })).toHaveCount(0);
  }

  // Un médico de la misma clínica sin asignación tampoco accede.
  const doctorContext = await browser.newContext();
  const doctorPage = await doctorContext.newPage();
  await enterClinicAs(doctorPage, database, { role: "doctor", tenantId });
  await doctorPage.goto(studyPath);
  await expect(doctorPage.getByText("No tenés acceso a este estudio.")).toBeVisible();
  await expect(leadImages(doctorPage)).toHaveCount(0);

  await otherContext.close();
  await doctorContext.close();
});

test("un estudio sin archivo muestra que la onda no está disponible, con el encabezado y la vuelta a la lista", async ({
  page,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica visor sin archivo"))).id;
  const patient = await enterClinicAs(page, database, { role: "patient", tenantId });
  // Crea la fila en la base sin el objeto del almacenamiento (queda en el proceso de la aplicación).
  const study = await database.seedStudy({
    tenantId,
    patientId: patient.relationshipId,
    uploadedByUserId: patient.user.id,
  });

  await page.goto(`/studies/${study.id}`);

  await expect(page.getByRole("heading", { name: "Estudio 1", level: 1 })).toBeVisible();
  await expect(page.getByText("La onda de este estudio no está disponible.")).toBeVisible();
  await expect(leadImages(page)).toHaveCount(0);

  await page.getByRole("link", { name: "Volver a mis estudios" }).click();
  await expect(page).toHaveURL(/\/studies$/);
});

test("el visor se adapta a tres anchos y a los dos esquemas de color sin desplazamiento horizontal", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Fija sus propios anchos de pantalla.");

  const tenantId = (await database.seedTenant(uniqueName("Clínica visor responsive"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await uploadValidStudy(page);
  await openWaveform(page, 1);
  const studyPath = new URL(page.url()).pathname;

  for (const scheme of ["light", "dark"] as const) {
    for (const width of [375, 768, 1280]) {
      const label = `${scheme} · ${width} px`;
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(studyPath);

      await expect(leadImages(page), label).toHaveCount(12);
      expect(await hasNoHorizontalScroll(page), `${label}: vista de las 12 derivaciones`).toBe(true);

      await page.getByRole("button", { name: "Ampliar la derivación V1", exact: true }).click();
      await expect(page.getByRole("group", { name: "Gráfica de la derivación V1", exact: true }), label).toBeVisible();
      expect(await hasNoHorizontalScroll(page), `${label}: vista ampliada`).toBe(true);
    }
  }
});
