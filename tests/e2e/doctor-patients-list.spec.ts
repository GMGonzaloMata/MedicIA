import { expect, test } from "@playwright/test";

import { enterClinicAs } from "../support/e2e-accounts";
import { createE2eDatabase, uniqueName } from "../support/e2e-database";

const DAY = 24 * 60 * 60 * 1000;

test("el médico busca, filtra y ordena a sus pacientes, y la dirección conserva la vista", async ({ page, browser }) => {
  const database = createE2eDatabase();
  const others = await browser.newContext();
  try {
    const tenantId = (await database.seedTenant(uniqueName("Clínica lista de pacientes"))).id;
    const doctor = await enterClinicAs(page, database, { role: "doctor", tenantId });
    const names = { recent: uniqueName("Reciente"), old: uniqueName("Antiguo"), none: uniqueName("Sin estudios") };
    const enterPatient = async (fullName: string) => {
      const patient = await enterClinicAs(await others.newPage(), database, { role: "patient", tenantId, fullName });
      await database.assignDoctor({ tenantId, membershipId: doctor.relationshipId, patientId: patient.relationshipId, createdByUserId: doctor.user.id });
      await others.clearCookies();
      return patient;
    };
    const recent = await enterPatient(names.recent);
    const old = await enterPatient(names.old);
    await enterPatient(names.none);
    for (const [patient, ageInDays] of [[old, 90], [recent, 2]] as const) {
      await database.seedStudy({
        tenantId,
        patientId: patient.relationshipId,
        uploadedByUserId: patient.user.id,
        uploadedAt: new Date(Date.now() - ageInDays * DAY),
      });
    }

    await page.goto("/patients");
    const cards = page.getByRole("list", { name: "Pacientes asignados, por nombre" }).getByRole("listitem");
    // Por omisión, el último estudio más reciente primero y los pacientes sin estudios al final.
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText(names.recent);
    await expect(cards.nth(0)).toContainText("Último estudio: Estudio 1");
    await expect(cards.nth(2)).toContainText(names.none);
    await expect(cards.nth(2)).toContainText("Sin estudios cargados todavía");

    const filters = page.getByRole("navigation", { name: "Filtrar pacientes" });
    await filters.getByRole("link", { name: /Con estudios recientes/ }).click();
    await expect(page).toHaveURL(/vista=recientes/);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(names.recent);

    await filters.getByRole("link", { name: /Sin estudios/ }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(names.none);

    await filters.getByRole("link", { name: /Todos/ }).click();
    await expect(page).not.toHaveURL(/vista=/);
    await expect(cards).toHaveCount(3);
    await page.getByRole("searchbox", { name: "Buscar paciente por nombre o documento" }).fill(names.old);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "1 resultado" })).toBeVisible();

    // La dirección conserva la búsqueda: al recargar se ve lo mismo.
    await page.reload();
    await expect(cards).toHaveCount(1);
    await page.getByRole("link", { name: "Limpiar búsqueda" }).click();
    await expect(cards).toHaveCount(3);

    await page.getByRole("link", { name: "Ordenar por nombre" }).click();
    await expect(page).toHaveURL(/orden=nombre/);
    await expect(cards.nth(0)).toContainText(names.old);

    await page.getByRole("searchbox", { name: "Buscar paciente por nombre o documento" }).fill("no-existe-nadie");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("No encontramos pacientes que coincidan con «no-existe-nadie».")).toBeVisible();
  } finally {
    await others.close();
    await database.close();
  }
});
