import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { InvitationEmail } from "@/modules/users/application/ports/out/invitation-mailer";
import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";
import {
  FAKE_FAILING_RECIPIENT,
  createFakeInvitationMailer,
} from "@/modules/users/infrastructure/adapters/fake-invitation-mailer";

const email: InvitationEmail = {
  to: "persona@example.com",
  clinicName: "Clínica del Sol",
  kind: "PATIENT",
  link: "http://localhost:3000/invite/abc",
  expiresAt: new Date("2026-11-18T15:00:00.000Z"),
};
const NOW = new Date("2026-11-11T12:00:00.000Z");

let directory: string;
let outboxFile: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "medicia-outbox-"));
  // Una carpeta que todavía no existe: el adaptador la crea.
  outboxFile = join(directory, "mail", "outbox.jsonl");
});

afterEach(() => rm(directory, { recursive: true, force: true }));

describe("correo simulado de invitaciones", () => {
  it("agrega una línea JSON por correo con el link y el contenido", async () => {
    const mailer = createFakeInvitationMailer({ outboxFile, now: () => NOW });

    await mailer.send(email);
    await mailer.send({ ...email, to: "otra@example.com" });

    const lines = (await readFile(outboxFile, "utf8")).trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      to: "persona@example.com",
      subject: "Invitación a Clínica del Sol en MedicIA",
      link: "http://localhost:3000/invite/abc",
      sentAt: NOW.toISOString(),
    });
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({ to: "otra@example.com" });
  });

  it("falla con el destinatario reservado y no escribe nada", async () => {
    const mailer = createFakeInvitationMailer({ outboxFile });

    await expect(mailer.send({ ...email, to: FAKE_FAILING_RECIPIENT })).rejects.toBeInstanceOf(MailDeliveryError);
    await expect(readFile(outboxFile, "utf8")).rejects.toThrow();
  });
});
