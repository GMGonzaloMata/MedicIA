import { expect, test, type Page } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName, type E2eDatabase } from "../support/e2e-database";
import {
  TABULAR_VALUES,
  WAVEFORM_SHAPE,
  buildNpy,
  buildNpz,
  buildZip,
  syntheticTabular,
  syntheticWaveform,
} from "../support/npz-builder";

let database: E2eDatabase;

test.beforeAll(() => {
  database = createE2eDatabase();
});

test.afterAll(async () => {
  await database.close();
});

async function chooseAndSubmit(page: Page, buffer: Buffer) {
  await page.getByLabel("Archivo del electrocardiograma").setInputFiles({
    name: "estudio.npz",
    mimeType: "application/octet-stream",
    buffer,
  });
  await page.getByRole("button", { name: "Subir estudio" }).click();
}

function tabularWith(index: number, value: number): Float32Array {
  const values = syntheticTabular();
  values[index] = value;

  return values;
}

const nanWaveform = () => {
  const values = syntheticWaveform();
  values[10] = Number.NaN;

  return values;
};

const DEFECTS: { name: string; file: () => Buffer; message: string }[] = [
  {
    name: "sin tabular",
    file: () =>
      buildZip([
        { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE, values: syntheticWaveform() }), method: 0 },
      ]),
    message: "Falta el campo «tabular».",
  },
  {
    name: "forma incorrecta",
    file: () => buildNpz({ waveform: { shape: [1, 2500, 11], values: new Float32Array(2500 * 11) } }),
    message: "El campo «waveform» debe tener 2500 muestras por 12 derivaciones.",
  },
  {
    name: "con NaN",
    file: () => buildNpz({ waveform: { shape: WAVEFORM_SHAPE, values: nanWaveform() } }),
    message: "El campo «waveform» contiene valores no finitos.",
  },
  {
    name: "sexo 2",
    file: () => buildNpz({ tabular: { shape: [TABULAR_VALUES], values: tabularWith(0, 2) } }),
    message: "El sexo (primera variable de «tabular») debe ser 0 o 1.",
  },
  {
    name: "sin estandarizar",
    file: () => buildNpz({ tabular: { shape: [TABULAR_VALUES], values: tabularWith(1, 450) } }),
    message: "está fuera del rango esperado",
  },
  {
    name: "con objetos (pickle)",
    file: () => buildNpz({ tabular: buildNpy({ descr: "|O", shape: [TABULAR_VALUES] }) }),
    message: "El campo «tabular» debe ser de tipo float32 o float64.",
  },
  {
    name: "no es un npz",
    file: () => Buffer.from("esto no es un zip"),
    message: "El archivo no es un .npz válido.",
  },
  {
    name: "demasiado grande",
    file: () => Buffer.alloc(2 * 1024 * 1024 + 1),
    message: "El archivo supera el tamaño máximo de 2 MB.",
  },
];

test("cada defecto muestra su motivo, la lista queda igual y el siguiente estudio recibe el número 1", async ({
  page,
}) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica rechazos"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");

  for (const defect of DEFECTS) {
    await chooseAndSubmit(page, defect.file());
    await expect(page.getByText(defect.message).first(), defect.name).toBeVisible();
    await expect(page.getByText("Todavía no hay estudios cargados."), defect.name).toBeVisible();
  }

  await chooseAndSubmit(page, buildNpz());
  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
});

test("un archivo con campos extra se acepta", async ({ page }) => {
  const tenantId = (await database.seedTenant(uniqueName("Clínica extras"))).id;
  await enterClinicAs(page, database, { role: "patient", tenantId });
  await page.goto("/studies");

  const extra = buildNpy({ shape: [5], values: [1, 2, 3, 4, 5] });
  await chooseAndSubmit(page, buildNpz({ extraEntries: [{ name: "notas.npy", data: extra, method: 0 }] }));

  await expect(page.getByText("Estudio 1 guardado.")).toBeVisible();
});
