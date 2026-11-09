import { expect, type Page } from "@playwright/test";

import { uniqueEmail, uniqueName, type E2eDatabase } from "./e2e-database";

export const E2E_PASSWORD = "Contraseña-larga-123";
export const FAKE_CODE = "000000";

// Crea la cuenta propia en la base (para poder vincularla a una clínica antes del primer ingreso)
// y registra y verifica la identidad por la interfaz, con el proveedor simulado.
export async function createVerifiedAccount(page: Page, database: E2eDatabase) {
  const email = uniqueEmail("persona");
  const fullName = uniqueName("Persona");
  const user = await database.seedUser({ email, fullName });

  await page.goto("/sign-up");
  await page.getByLabel("Nombre completo").fill(fullName);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // La contraseña se elige en el segundo paso, junto con el código (R18).
  await page.getByLabel("Código de verificación").fill(FAKE_CODE);
  await page.getByLabel("Elegí tu contraseña").fill(E2E_PASSWORD);
  await page.getByLabel("Repetí tu contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Verificar correo" }).click();
  // Esperar el aviso (y no solo la URL) asegura que ya se muestra la pantalla de ingreso nueva.
  await expect(page.getByText("Tu cuenta quedó verificada. Ya podés ingresar.")).toBeVisible();

  return { user, email };
}

// Completa la pantalla de ingreso que ya está abierta.
export async function signIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}
