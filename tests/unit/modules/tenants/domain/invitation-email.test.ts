import { describe, expect, it } from "vitest";

import { buildInvitationEmail } from "@/modules/tenants/domain/invitation-email";

const LINK = "https://app.example.com/invitation/abc-DEF_123";

describe("correo de invitación", () => {
  it("el asunto nombra la clínica", () => {
    const email = buildInvitationEmail({
      clinicName: "Clínica del Sur",
      roles: { isClinicAdmin: false, isDoctor: true },
      link: LINK,
    });

    expect(email.subject).toBe("Te invitaron a Clínica del Sur en MedicIA");
  });

  it("el cuerpo incluye el enlace, el rol en palabras, el vencimiento, el uso único y las dos aclaraciones", () => {
    const email = buildInvitationEmail({
      clinicName: "Clínica del Sur",
      roles: { isClinicAdmin: true, isDoctor: true },
      link: LINK,
    });

    for (const body of [email.text, email.html]) {
      expect(body).toContain("médico y administrador");
      expect(body).toContain("Este enlace vence en 7 días y se puede usar una sola vez.");
      expect(body).toContain("registrate con este mismo correo y volvé a abrir este enlace");
      expect(body).toContain("ignorá este mensaje");
    }

    expect(email.text).toContain(LINK);
    expect(email.html).toContain(`href="${LINK}"`);
  });

  it("escapa el nombre de la clínica en el HTML", () => {
    const email = buildInvitationEmail({
      clinicName: '<script>alert("x")</script> & Cía',
      roles: { isClinicAdmin: true, isDoctor: false },
      link: LINK,
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp; Cía");
  });

  it("no usa imágenes remotas ni seguimiento de aperturas", () => {
    const email = buildInvitationEmail({
      clinicName: "Clínica",
      roles: { isClinicAdmin: false, isDoctor: true },
      link: LINK,
    });

    expect(email.html).not.toMatch(/<img|<link|<script|<iframe/i);
  });
});
