import { describe, expect, it } from "vitest";

import { renderAccessNotice } from "@/modules/users/application/use-cases/render-access-notice";

const SET_PASSWORD_URL = "https://medicia.example/verify-email";

describe("renderAccessNotice", () => {
  it("a una persona nueva le indica el enlace para elegir su contraseña y el código aparte", () => {
    const { subject, text, html } = renderAccessNotice({
      to: "persona@example.com",
      clinicName: "Clínica del Sol",
      kind: "DOCTOR",
      setPasswordUrl: SET_PASSWORD_URL,
    });

    expect(subject).toBe("Te sumaron a Clínica del Sol en MedicIA");
    expect(text).toContain("como médico");
    expect(text).toContain(SET_PASSWORD_URL);
    expect(text).toContain("código de verificación");
    expect(html).toContain(`href="${SET_PASSWORD_URL}"`);
  });

  it("a una cuenta que ya existía le avisa de la clínica, sin ningún enlace", () => {
    const { text, html } = renderAccessNotice({
      to: "persona@example.com",
      clinicName: "Clínica del Sol",
      kind: "PATIENT",
      setPasswordUrl: null,
    });

    expect(text).toContain("como paciente");
    expect(text).toContain("contraseña de siempre");
    expect(text).not.toContain("http");
    expect(html).not.toContain("href");
  });

  it("no puede inyectar encabezados ni HTML a través del nombre de la clínica", () => {
    const { subject, html } = renderAccessNotice({
      to: "persona@example.com",
      clinicName: "Sol\r\nBcc: otro@example.com <script>",
      kind: "PATIENT",
      setPasswordUrl: null,
    });

    expect(subject).not.toMatch(/[\r\n]/);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
