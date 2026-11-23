import { readFile } from "node:fs/promises";

const INVITATION_PATH = /\/invitation\/[A-Za-z0-9_-]+/;
const ATTEMPTS = 50;
const WAIT_MS = 200;

interface OutboxMessage {
  to: string;
  text: string;
}

// Lee el archivo donde el correo simulado deja cada mensaje (una línea JSON por correo). Si todavía no existe,
// no hay mensajes.
async function readOutbox(): Promise<OutboxMessage[]> {
  const file = process.env.FAKE_MAIL_OUTBOX_FILE;

  if (!file) {
    throw new Error("Falta FAKE_MAIL_OUTBOX_FILE: la configuración de Playwright lo define.");
  }

  try {
    const content = await readFile(file, "utf8");

    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as OutboxMessage);
  } catch {
    return [];
  }
}

// Ruta del enlace de invitación del último correo enviado a esa dirección. Espera un poco: el servidor escribe el
// archivo de forma asíncrona. Devuelve solo la ruta (`/invitation/<token>`), para abrirla con el `baseURL` de la prueba.
export async function readInvitationPath(to: string): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const messages = (await readOutbox()).filter((message) => message.to === to);
    const path = messages.at(-1)?.text.match(INVITATION_PATH)?.[0];

    if (path) {
      return path;
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }

  throw new Error("No llegó el correo de invitación al archivo de salida.");
}

export async function countMailsTo(to: string): Promise<number> {
  return (await readOutbox()).filter((message) => message.to === to).length;
}
