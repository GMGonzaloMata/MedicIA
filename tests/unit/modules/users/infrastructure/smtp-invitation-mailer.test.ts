import { describe, expect, it, vi } from "vitest";

import type { InvitationEmail } from "@/modules/users/application/ports/out/invitation-mailer";
import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";
import {
  createSmtpInvitationMailer,
  toMailDeliveryErrorCode,
  type MailTransport,
} from "@/modules/users/infrastructure/adapters/smtp-invitation-mailer";

const email: InvitationEmail = {
  to: "persona@example.com",
  clinicName: "Clínica del Sol",
  kind: "DOCTOR",
  link: "https://medicia.example/invite/abc",
  expiresAt: new Date("2026-11-18T15:00:00.000Z"),
};
const FROM = "medicia.proyecto@example.com";
const SECRET_PASSWORD = "contraseña-de-aplicacion-secreta";

function transportFailingWith(error: unknown): MailTransport {
  return { sendMail: vi.fn().mockRejectedValue(error) };
}

describe("correo de invitaciones por SMTP", () => {
  it("envía un mensaje con asunto, texto y HTML desde el remitente configurado", async () => {
    const transport: MailTransport = { sendMail: vi.fn().mockResolvedValue({}) };

    await createSmtpInvitationMailer({ transport, from: FROM }).send(email);

    expect(transport.sendMail).toHaveBeenCalledOnce();
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: FROM,
      to: "persona@example.com",
      subject: "Invitación a Clínica del Sol en MedicIA",
      text: expect.stringContaining("https://medicia.example/invite/abc"),
      html: expect.stringContaining("https://medicia.example/invite/abc"),
    });
  });

  it.each([
    ["un fallo de autenticación", Object.assign(new Error("535 Invalid login"), { code: "EAUTH" }), "NOT_CONFIGURED"],
    ["un destinatario inválido", Object.assign(new Error("Can't send mail"), { code: "EENVELOPE" }), "REJECTED"],
    ["una respuesta 550", Object.assign(new Error("550 no such user"), { responseCode: 550 }), "REJECTED"],
    ["un corte de conexión", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNECTION" }), "UNAVAILABLE"],
    ["un tiempo agotado", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), "UNAVAILABLE"],
    ["una respuesta temporal 421", Object.assign(new Error("421 try later"), { responseCode: 421 }), "UNAVAILABLE"],
    ["un valor que no es un error", "texto", "UNAVAILABLE"],
  ])("traduce %s a un código genérico", async (description, failure, expectedCode) => {
    const mailer = createSmtpInvitationMailer({ transport: transportFailingWith(failure), from: FROM });

    const rejection = await mailer.send(email).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(MailDeliveryError);
    expect(rejection).toMatchObject({ code: expectedCode });
  });

  it("el error que sale nunca contiene el destinatario, el link ni la contraseña del mensaje original", async () => {
    const failure = Object.assign(
      new Error(`535 login failed for ${FROM} password ${SECRET_PASSWORD} to persona@example.com`),
      { code: "EAUTH", response: `535 ${SECRET_PASSWORD}` },
    );
    const mailer = createSmtpInvitationMailer({ transport: transportFailingWith(failure), from: FROM });

    const rejection = await mailer.send(email).catch((error: unknown) => error);
    const text = JSON.stringify({ message: rejection instanceof Error ? rejection.message : "", rejection });

    expect(text).not.toContain(SECRET_PASSWORD);
    expect(text).not.toContain("persona@example.com");
    expect(text).not.toContain(FROM);
    expect(text).not.toContain("/invite/");
  });

  it("clasifica los códigos sin necesidad de un error de verdad", () => {
    expect(toMailDeliveryErrorCode({ code: "EAUTH" })).toBe("NOT_CONFIGURED");
    expect(toMailDeliveryErrorCode(null)).toBe("UNAVAILABLE");
    expect(toMailDeliveryErrorCode({ responseCode: 599 })).toBe("REJECTED");
    expect(toMailDeliveryErrorCode({ responseCode: 600 })).toBe("UNAVAILABLE");
  });
});
