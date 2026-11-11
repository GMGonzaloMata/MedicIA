import { describe, expect, it } from "vitest";

import type { InvitationEmail } from "@/modules/users/application/ports/out/invitation-mailer";
import { renderInvitationEmail } from "@/modules/users/application/use-cases/render-invitation-email";

const LINK = "https://medicia.example/invite/abc_DEF-123";
const baseEmail: InvitationEmail = {
  to: "persona@example.com",
  clinicName: "Clínica del Sol",
  kind: "DOCTOR",
  link: LINK,
  expiresAt: new Date("2026-11-18T15:00:00.000Z"),
};

describe("correo de invitación", () => {
  it("el asunto nombra la clínica", () => {
    expect(renderInvitationEmail(baseEmail).subject).toBe("Invitación a Clínica del Sol en MedicIA");
  });

  it("el texto y el HTML llevan el link, la clínica, el vínculo y el vencimiento", () => {
    const { text, html } = renderInvitationEmail(baseEmail);

    for (const body of [text, html]) {
      expect(body).toContain(LINK);
      expect(body).toContain("Clínica del Sol");
      expect(body).toContain("como médico");
      expect(body).toContain("18 de noviembre de 2026");
    }
  });

  it("pide la matrícula a un médico y el documento a un paciente, sin mencionar el dato", () => {
    const doctor = renderInvitationEmail(baseEmail);
    const patient = renderInvitationEmail({ ...baseEmail, kind: "PATIENT" });

    expect(doctor.text).toContain("tu matrícula");
    expect(doctor.text).not.toContain("tu documento");
    expect(patient.text).toContain("tu documento");
    expect(patient.text).toContain("como paciente");
  });

  it("escapa el nombre de la clínica en el HTML", () => {
    const { html } = renderInvitationEmail({ ...baseEmail, clinicName: '<script>alert("x")</script> & Cía' });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cía");
  });

  it("el asunto no puede incluir saltos de línea", () => {
    const { subject } = renderInvitationEmail({ ...baseEmail, clinicName: "Clínica\r\nBcc: otro@example.com" });

    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("no incluye el destinatario ni datos de quien invita", () => {
    const { text, html, subject } = renderInvitationEmail(baseEmail);

    expect(`${subject}${text}${html}`).not.toContain("persona@example.com");
  });
});
