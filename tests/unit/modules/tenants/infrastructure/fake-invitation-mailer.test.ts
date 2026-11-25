import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MailDeliveryError } from "@/modules/tenants/domain/mail-errors";
import { createFakeInvitationMailer } from "@/modules/tenants/infrastructure/adapters/fake-invitation-mailer";

const MESSAGE = { to: "ana@clinica.com", subject: "Asunto", text: "Texto", html: "<p>Texto</p>" };

describe("correo simulado de invitaciones", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "medicia-outbox-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("agrega cada correo como una línea JSON, creando la carpeta si falta", async () => {
    const outbox = join(directory, "nueva", "outbox.jsonl");
    const mailer = createFakeInvitationMailer(outbox);

    await mailer.send(MESSAGE);
    await mailer.send({ ...MESSAGE, to: "luis@clinica.com" });

    const lines = (await readFile(outbox, "utf8")).trim().split("\n");

    expect(lines.map((line) => JSON.parse(line))).toEqual([MESSAGE, { ...MESSAGE, to: "luis@clinica.com" }]);
  });

  it("traduce un fallo de escritura a MailDeliveryError sin exponer la causa", async () => {
    // Un archivo común donde debería haber una carpeta hace fallar la creación del directorio.
    const blocker = join(directory, "archivo");
    await writeFile(blocker, "x");
    const mailer = createFakeInvitationMailer(join(blocker, "outbox.jsonl"));

    const failure = await mailer.send(MESSAGE).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as Error).message).not.toContain(directory);
  });
});
