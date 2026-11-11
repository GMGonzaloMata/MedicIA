import { expect, test, type Locator, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import { buildNpz, buildNpzWithTabular } from "../support/npz-builder";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

// El modelo simulado tarda 1,5 s y la pantalla consulta cada 3 s: el resultado aparece pocos segundos después.
const RESULT_TIMEOUT = 20_000;

async function uploadStudy(page: Page, number: number, bytes: Buffer = buildNpz()) {
  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "ecg-de-prueba.npz",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();
  await expect(page.getByText(`Estudio ${number} guardado.`)).toBeVisible();
}

// En pantallas anchas la lista es una tabla y en el móvil son tarjetas: solo uno de los dos vínculos es visible.
async function openStudy(page: Page, number: number) {
  await page.getByRole("link", { name: `Ver onda del estudio ${number}` }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: `Estudio ${number}`, level: 1 })).toBeVisible();
}

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

const requestButton = (page: Page) => page.getByRole("button", { name: "Analizar estudio" });
const meters = (page: Page) => page.getByRole("meter");
const resultTitle = (page: Page) => page.getByRole("heading", { name: "Resultado del análisis" });

async function requestAnalysis(page: Page) {
  await requestButton(page).click();
  await expect(page.getByRole("button", { name: "Hay un análisis en curso" })).toBeVisible();
}

// Avanza con Tab hasta que el elemento recibe el foco, y comprueba que el foco se ve.
async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 150; step += 1) {
    await page.keyboard.press("Tab");

    if (await target.evaluate((element) => element === document.activeElement)) {
      const outline = await target.evaluate((element) => getComputedStyle(element).outlineStyle);

      expect(outline, "el foco debe verse").not.toBe("none");

      return;
    }
  }

  throw new Error("No se llegó al elemento con el teclado.");
}

test("el paciente pide el análisis, ve que está en curso y luego el resultado con su advertencia y el historial", async ({
  page,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica análisis paciente"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await uploadStudy(page, 1);
  await openStudy(page, 1);

  await expect(page.getByText("Todavía no hay análisis de este estudio.")).toBeVisible();

  await requestAnalysis(page);
  await expect(page.getByText("Analizando el estudio…")).toBeVisible();

  await expect(resultTitle(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
  await expect(meters(page)).toHaveCount(12);
  await expect(page.getByText(/Son probabilidades estimadas por un modelo de investigación/)).toBeVisible();
  await expect(page.locator("dd", { hasText: "echonext-mini-fake" })).toBeVisible();
  await expect(page.locator("dd", { hasText: "0.0.0-fake" })).toBeVisible();
  await expect(page.getByText("al menos uno de los otros once")).toBeVisible();

  // El progreso desaparece y se puede pedir otro.
  await expect(page.getByText("Analizando el estudio…")).toHaveCount(0);
  await expect(requestButton(page)).toBeEnabled();

  // El historial lista el análisis, completado, con el vínculo para abrirlo.
  const history = page.getByRole("region", { name: "Historial de análisis" });

  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history.getByText("Completado")).toBeVisible();
  await expect(history.getByText("El propio paciente")).toBeVisible();
  await expect(history.getByRole("link", { name: /^Ver resultado del análisis del / })).toBeVisible();
});

test("el médico con un paciente asignado pide el análisis y la clave del archivo y las variables no llegan al navegador", async ({
  page,
  browser,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica análisis médico"))).id;
  const patientName = uniqueName("Paciente análisis");

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
  // Un valor reconocible en la frecuencia ventricular (quinta variable): no debe aparecer en la página.
  await uploadStudy(page, 1, buildNpzWithTabular({ 4: 3.14159 }));
  await openStudy(page, 1);

  await requestAnalysis(page);
  await expect(resultTitle(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
  await expect(meters(page)).toHaveCount(12);
  // El médico figura como quien lo pidió.
  await expect(page.getByRole("region", { name: "Historial de análisis" }).getByRole("listitem")).toHaveCount(1);
  expect(await page.getByRole("region", { name: "Historial de análisis" }).textContent()).not.toContain(
    "El propio paciente",
  );

  const html = (await page.content()).replaceAll("tabular-nums", "");

  expect(html).not.toContain(".ecg1");
  expect(html).not.toContain("MEDECG01");
  expect(html).not.toContain("tabular");
  expect(html).not.toContain("3.14159");
  expect(html).not.toContain("3,14159");
});

test("quien no tiene acceso al estudio ve siempre lo mismo, sin sección de análisis, y no se crea ningún análisis", async ({
  page,
  browser,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica análisis acceso"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await uploadStudy(page, 1);
  await openStudy(page, 1);
  const studyPath = new URL(page.url()).pathname;

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await enterClinicAs(otherPage, database, { role: "patient", tenantId });

  const doctorContext = await browser.newContext();
  const doctorPage = await doctorContext.newPage();
  await enterClinicAs(doctorPage, database, { role: "doctor", tenantId });

  for (const [who, visitor] of [
    ["otro paciente", otherPage],
    ["médico sin asignación", doctorPage],
  ] as const) {
    for (const path of [studyPath, "/studies/00000000-0000-4000-8000-ffffffffffff", "/studies/no-es-un-uuid"]) {
      await visitor.goto(path);
      await expect(visitor.getByText("No tenés acceso a este estudio."), `${who}: ${path}`).toBeVisible();
      await expect(visitor.getByRole("heading", { name: "Análisis", level: 2 }), `${who}: ${path}`).toHaveCount(0);
      await expect(visitor.getByRole("button", { name: "Analizar estudio" })).toHaveCount(0);
    }
  }

  expect(await database.countAnalyses(tenantId)).toBe(0);

  await otherContext.close();
  await doctorContext.close();
});

test("una falla del modelo queda en el historial con un motivo claro, se puede reintentar y otro estudio completa", async ({
  page,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica análisis fallas"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  // Estudio 1: el modelo no está disponible (7.78). Estudio 2: el modelo rechaza la entrada (7.77). Estudio 3: normal.
  await uploadStudy(page, 1, buildNpzWithTabular({ 3: 7.78 }));
  await uploadStudy(page, 2, buildNpzWithTabular({ 3: 7.77 }));
  await uploadStudy(page, 3);

  // Modelo no disponible: falla, no deja nada en curso y se puede volver a pedir.
  await openStudy(page, 1);
  const history = page.getByRole("region", { name: "Historial de análisis" });
  const unavailable = "El análisis no está disponible en este momento. Probá de nuevo más tarde.";

  await requestAnalysis(page);
  await expect(history.getByText("Fallido")).toBeVisible({ timeout: RESULT_TIMEOUT });
  await expect(history.getByText(unavailable)).toBeVisible();
  await expect(requestButton(page)).toBeEnabled();
  await expect(meters(page)).toHaveCount(0);

  await requestAnalysis(page);
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByText("Fallido")).toHaveCount(2, { timeout: RESULT_TIMEOUT });
  await expect(page.getByText("Analizando el estudio…")).toHaveCount(0);
  await expect(requestButton(page)).toBeEnabled();

  // Entrada rechazada.
  await page.goto("/studies");
  await openStudy(page, 2);
  await requestAnalysis(page);
  await expect(history.getByText("No pudimos analizar este estudio.")).toBeVisible({ timeout: RESULT_TIMEOUT });

  // Otro estudio sin centinela completa.
  await page.goto("/studies");
  await openStudy(page, 3);
  await requestAnalysis(page);
  await expect(resultTitle(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
  await expect(meters(page)).toHaveCount(12);
});

test("un estudio sin archivo deja un análisis fallido con el motivo y la sección sigue disponible", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica análisis sin archivo"))).id;
  const patient = await enterClinicAs(page, database, { role: "patient", tenantId });
  const study = await database.seedStudy({
    tenantId,
    patientId: patient.relationshipId,
    uploadedByUserId: patient.user.id,
  });

  await page.goto(`/studies/${study.id}`);
  await expect(page.getByText("La onda de este estudio no está disponible. Probá")).toBeVisible();

  await requestButton(page).click();

  const history = page.getByRole("region", { name: "Historial de análisis" });

  await expect(history.getByText("Fallido")).toBeVisible();
  await expect(history.getByText("La onda de este estudio no está disponible.")).toBeVisible();
  await expect(requestButton(page)).toBeEnabled();
});

test("el resultado se adapta a tres anchos y a los dos esquemas de color y se opera con teclado", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Fija sus propios anchos de pantalla.");

  const tenantId = (await database.seedTenant(uniqueName("Clínica análisis responsive"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.getByRole("link", { name: "Mis estudios" }).first().click();
  await uploadStudy(page, 1);
  await openStudy(page, 1);
  const studyPath = new URL(page.url()).pathname;

  await requestAnalysis(page);
  await expect(resultTitle(page)).toBeVisible({ timeout: RESULT_TIMEOUT });

  for (const scheme of ["light", "dark"] as const) {
    for (const width of [375, 768, 1280]) {
      const label = `${scheme} · ${width} px`;
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(studyPath);

      await expect(resultTitle(page), label).toBeVisible();
      await expect(meters(page), label).toHaveCount(12);
      for (const meter of await meters(page).all()) {
        await expect(meter, label).toBeVisible();
      }
      expect(await hasNoHorizontalScroll(page), label).toBe(true);
    }
  }

  // Con teclado: el botón y el vínculo del historial se alcanzan y muestran el foco.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(studyPath);
  await expect(resultTitle(page)).toBeVisible();
  await tabTo(page, requestButton(page));
  await tabTo(page, page.getByRole("link", { name: /^Ver resultado del análisis del / }));
});
