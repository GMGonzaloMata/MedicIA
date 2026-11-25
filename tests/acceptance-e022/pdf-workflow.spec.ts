import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName } from "../support/e2e-database";
import { openUploadForm } from "../e2e/fixtures/npz-upload";

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const FIXTURE_NAME = "ecg-sintetico-e022.pdf";
const VIEWER = "Visor de la señal cruda del PDF";
const REPORT = "Informe unificado";
const REQUEST = "Analizar estudio";
const WAITING = "Analizando el estudio…";
const E022_INDICATOR = "Puntuación de investigación para posible FEVI ≤45 %";
const MINI_OMISSION = "EchoNext-Mini no disponible (NOT_AVAILABLE). No se ejecutó. Esto no equivale a un hallazgo negativo.";
const RESULT_TIMEOUT = 45_000;

async function loadVerifiedFixture(): Promise<Buffer> {
  const expected = process.env.MEDICIA_E022_FIXTURE_SHA256;
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) throw new Error("Falta el SHA-256 verificado del PDF sintético.");

  try {
    let directory = resolve(__dirname, "../..");
    // Rechazar enlaces/junctions en toda la ruta de scratch, antes de abrir el archivo fijo.
    for (const part of ["node_modules", ".cache", "medicia-acceptance-e022"]) {
      directory = join(directory, part);
      if (!(await lstat(directory)).isDirectory()) throw new Error();
    }
    const path = join(directory, "fixture.pdf");
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size < 5 || metadata.size > MAX_PDF_BYTES) throw new Error();
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== metadata.dev || opened.ino !== metadata.ino || opened.size !== metadata.size) throw new Error();
      const buffer = Buffer.alloc(metadata.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      const pdf = buffer.subarray(0, length);
      if (length !== metadata.size || pdf.subarray(0, 5).toString("ascii") !== "%PDF-" ||
          createHash("sha256").update(pdf).digest("hex") !== expected) throw new Error();
      return pdf;
    } finally {
      await file.close();
    }
  } catch {
    throw new Error("El PDF sintético fijo falta, no es regular, excede 2 MiB o no coincide con el SHA-256 verificado.");
  }
}

async function observeWaiting(page: Page): Promise<void> {
  // Next puede remontar el panel al elegir el ID del pedido. Observamos el documento para
  // captar incluso un estado breve, sin demorar ni interceptar al modelo real.
  await page.evaluate(({ report, waiting, scoreTitle }) => {
    const observer = new MutationObserver(() => {
      const section = Array.from(document.querySelectorAll("section[aria-labelledby]")).find((element) =>
        document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent === report);
      if (!section || !Array.from(section.querySelectorAll('[role="status"]')).some((node) => node.textContent === waiting)) return;
      const showsScore = Array.from(section.querySelectorAll("h4")).some((node) => node.textContent === scoreTitle);
      document.documentElement.dataset.e022Waiting = showsScore ? "with-score" : "without-score";
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }, { report: REPORT, waiting: WAITING, scoreTitle: E022_INDICATOR });
}

async function expectPartialReport(report: Locator): Promise<string> {
  await expect(report.getByText("Informe parcial", { exact: true })).toBeVisible({ timeout: RESULT_TIMEOUT });
  await expect(report.getByText(WAITING, { exact: true })).toHaveCount(0);
  await expect(report.getByText("E022: completado", { exact: true })).toBeVisible();
  await expect(report.getByText(MINI_OMISSION, { exact: true })).toBeVisible();
  await expect(report.getByText(/^EchoNext-Mini:/)).toHaveCount(0);
  await expect(report.getByText("Pedido por: El propio paciente", { exact: true })).toBeVisible();
  await expect(report.getByText("Son posibles hallazgos de apoyo clínico, no un diagnóstico, y requieren la evaluación de un profesional.", { exact: true })).toBeVisible();

  const indicator = report.getByRole("group", { name: E022_INDICATOR, exact: true });
  await expect(indicator).toBeVisible();
  await expect(indicator.getByText("Es una puntuación de investigación, no un valor de FEVI ni una probabilidad clínicamente calibrada.", { exact: true })).toBeVisible();
  await expect(indicator.getByText(`E022 · e022-combined · versión sha256:${process.env.E022_MODEL_SHA256}`, { exact: true })).toBeVisible();
  await expect(indicator.getByText(`Preparación: sha256:${process.env.E022_PREPROCESSING_SHA256} · Ejecución:`, { exact: false })).toBeVisible();
  const score = indicator.getByText(/^(?:0(?:,\d{1,6})?|1)$/);
  await expect(score).toBeVisible();
  return (await score.innerText()).trim();
}

async function expectStudyDenied(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Sin acceso", exact: true })).toBeVisible();
  await expect(page.getByText("No tenés acceso a este estudio.", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: VIEWER })).toHaveCount(0);
  await expect(page.getByRole("region", { name: REPORT })).toHaveCount(0);
  await expect(page.getByRole("button", { name: REQUEST, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: E022_INDICATOR })).toHaveCount(0);
}

test("PDF sintético: visor, pedido explícito a E022, informe persistido y rechazo entre clínicas", async ({ page, browser }) => {
  const pdf = await loadVerifiedFixture();
  const database = createE2eDatabase();
  try {
    const { id: tenantId } = await database.seedTenant(uniqueName("Clínica sintética E022"));
    await enterClinicAs(page, database, { role: "patient", tenantId });
    await page.goto("/studies");
    await expect(page.getByText("Todavía no hay estudios cargados.", { exact: true })).toBeVisible();
    await openUploadForm(page);
    await expect(page.getByLabel("Formato del archivo", { exact: true })).toHaveValue("PDF");
    await page.getByLabel("Tipo de estudio", { exact: true }).selectOption({ label: "Electrocardiograma (ECG)" });
    await page.getByLabel("Archivo del electrocardiograma", { exact: true }).setInputFiles({
      name: FIXTURE_NAME,
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByRole("button", { name: "Reemplazar PDF", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Subir estudio", exact: true }).click();

    // PDF redirige al estudio guardado; no muestra el mensaje de éxito del formulario NPZ.
    await expect(page).toHaveURL(/\/studies\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Estudio 1", level: 1 })).toBeVisible();
    const viewer = page.getByRole("figure", { name: VIEWER });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img", { name: /señal cruda del PDF$/ })).toHaveCount(12);
    await viewer.getByRole("button", { name: "Ampliar la derivación II", exact: true }).click();
    await expect(viewer.getByRole("group", { name: "Gráfica de la derivación II" }).getByText("Amplitud en microvoltios (uV)")).toBeVisible();
    const report = page.getByRole("region", { name: REPORT });
    await expect(report.getByRole("heading", { name: E022_INDICATOR })).toHaveCount(0);
    expect(await database.countAnalyses(tenantId)).toBe(0);

    await observeWaiting(page);
    await report.getByRole("button", { name: REQUEST, exact: true }).click();
    const originalScore = await expectPartialReport(report);
    await expect(page.locator("html")).toHaveAttribute("data-e022-waiting", "without-score");
    await expect(page).toHaveURL(/\/studies\/[0-9a-f-]{36}\?analysisId=[0-9a-f-]{36}$/);
    const reportUrl = page.url();
    expect(await database.countAnalyses(tenantId)).toBe(1);

    await page.reload();
    await expect(page).toHaveURL(reportUrl);
    expect((await expectPartialReport(report)) === originalScore, "la puntuación persistida es la del mismo pedido").toBe(true);
    expect(await database.countAnalyses(tenantId)).toBe(1);

    const { id: otherTenantId } = await database.seedTenant(uniqueName("Otra clínica sintética E022"));
    const otherContext = await browser.newContext();
    try {
      const otherPage = await otherContext.newPage();
      await enterClinicAs(otherPage, database, { role: "patient", tenantId: otherTenantId });
      const { pathname, search } = new URL(reportUrl);
      for (const url of [pathname, `${pathname}${search}`, `/studies/${randomUUID()}?analysisId=${randomUUID()}`]) {
        await expectStudyDenied(otherPage, url);
      }
      expect(await database.countAnalyses(otherTenantId)).toBe(0);
      expect(await database.countAnalyses(tenantId)).toBe(1);
    } finally {
      await otherContext.close();
    }
  } finally {
    await database.close();
  }
});
