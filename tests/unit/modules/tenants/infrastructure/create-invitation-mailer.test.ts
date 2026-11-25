import { describe, expect, it } from "vitest";

import { createInvitationMailer } from "@/modules/tenants/infrastructure/adapters/create-invitation-mailer";

describe("elección del correo de invitaciones", () => {
  it("fake elige el correo simulado cuando hay archivo de salida", () => {
    const mailer = createInvitationMailer({ INVITATION_MAILER: "fake", FAKE_MAIL_OUTBOX_FILE: ".tmp/salida.jsonl" });

    expect(mailer).toHaveProperty("send");
  });

  it("fake sin archivo de salida falla nombrando la variable", () => {
    expect(() => createInvitationMailer({ INVITATION_MAILER: "fake" })).toThrow(/FAKE_MAIL_OUTBOX_FILE/);
  });

  it("un valor ausente o desconocido lanza un error que nombra la variable", () => {
    expect(() => createInvitationMailer({})).toThrow(/INVITATION_MAILER/);
    expect(() => createInvitationMailer({ INVITATION_MAILER: "paloma" })).toThrow(/INVITATION_MAILER/);
  });

  it("smtp con la configuración completa elige el correo real", () => {
    const mailer = createInvitationMailer({
      INVITATION_MAILER: "smtp",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "usuario",
      SMTP_PASSWORD: "clave",
      INVITATION_FROM_ADDRESS: "no-responder@example.com",
    });

    expect(mailer).toHaveProperty("send");
  });

  it("smtp con la configuración incompleta falla sin mostrar valores", () => {
    expect(() => createInvitationMailer({ INVITATION_MAILER: "smtp", SMTP_PASSWORD: "clave-secreta" })).toThrow(
      /SMTP_HOST/,
    );
    expect(() => createInvitationMailer({ INVITATION_MAILER: "smtp", SMTP_PASSWORD: "clave-secreta" })).not.toThrow(
      /clave-secreta/,
    );
  });
});
