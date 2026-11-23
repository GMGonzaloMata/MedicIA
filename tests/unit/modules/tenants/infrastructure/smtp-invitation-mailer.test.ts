import { describe, expect, it, vi } from "vitest";

import { MailDeliveryError } from "@/modules/tenants/domain/mail-errors";
import {
  createSmtpInvitationMailer,
  readSmtpConfig,
  type MailTransport,
} from "@/modules/tenants/infrastructure/adapters/smtp-invitation-mailer";

const MESSAGE = { to: "ana@clinica.com", subject: "Asunto", text: "Texto", html: "<p>Texto</p>" };
const FROM = "MedicIA <no-responder@example.com>";

describe("correo SMTP de invitaciones", () => {
  it("arma el mensaje con el remitente configurado", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const mailer = createSmtpInvitationMailer({ sendMail } satisfies MailTransport, FROM);

    await mailer.send(MESSAGE);

    expect(sendMail).toHaveBeenCalledWith({ from: FROM, ...MESSAGE });
  });

  it("un error del servidor se traduce a MailDeliveryError sin su mensaje", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("535 clave incorrecta para usuario@gmail.com"));
    const mailer = createSmtpInvitationMailer({ sendMail }, FROM);

    const error = await mailer.send(MESSAGE).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as Error).message).not.toContain("usuario@gmail.com");
  });

  it("no registra el cuerpo ni los datos de conexión", async () => {
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "log"), vi.spyOn(console, "warn")];
    const mailer = createSmtpInvitationMailer({ sendMail: vi.fn().mockRejectedValue(new Error("fallo")) }, FROM);

    await mailer.send(MESSAGE).catch(() => undefined);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe("configuración SMTP", () => {
  const env = {
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "usuario",
    SMTP_PASSWORD: "clave",
    INVITATION_FROM_ADDRESS: "no-responder@example.com",
  };

  it("lee los cinco valores", () => {
    expect(readSmtpConfig(env)).toEqual({
      host: "smtp.example.com",
      port: 465,
      user: "usuario",
      password: "clave",
      fromAddress: "no-responder@example.com",
    });
  });

  it.each(["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "INVITATION_FROM_ADDRESS"])("falta %s", (name) => {
    expect(() => readSmtpConfig({ ...env, [name]: undefined })).toThrow();
  });

  it("rechaza un puerto que no es un entero positivo", () => {
    expect(() => readSmtpConfig({ ...env, SMTP_PORT: "abc" })).toThrow();
    expect(() => readSmtpConfig({ ...env, SMTP_PORT: "-1" })).toThrow();
  });
});
