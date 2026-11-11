import { readFile } from "node:fs/promises";

import { expect } from "@playwright/test";

// Mismo archivo que escribe el correo simulado del servidor de pruebas (`FAKE_MAIL_OUTBOX_FILE` en
// `playwright.config.ts`). No se vacía entre archivos de pruebas: los tres proyectos (escritorio, tablet y móvil) corren a
// la vez y vaciarlo borraría los mensajes de una prueba en curso. Cada prueba usa correos únicos y filtra por destinatario.
export const E2E_MAIL_OUTBOX_FILE = ".tmp/e2e-outbox.jsonl";

export interface OutboxMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  link: string;
  sentAt: string;
}

export async function readOutbox(): Promise<OutboxMessage[]> {
  let content: string;

  try {
    content = await readFile(E2E_MAIL_OUTBOX_FILE, "utf8");
  } catch {
    // Todavía no se envió ningún correo.
    return [];
  }

  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as OutboxMessage);
}

// Todos los links enviados a ese correo, del primero al último.
export async function invitationLinksFor(email: string): Promise<string[]> {
  return (await readOutbox()).filter((message) => message.to === email).map((message) => message.link);
}

// Espera el correo y devuelve el link del último mensaje para ese destinatario.
export async function waitForInvitationLink(email: string): Promise<string> {
  await expect
    .poll(async () => (await invitationLinksFor(email)).length, { message: `Esperando el correo para ${email}` })
    .toBeGreaterThan(0);

  const links = await invitationLinksFor(email);

  return links[links.length - 1] ?? "";
}
