import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";

import { createInvitationScenario } from "../../../../support/invitation-scenario";

// Valores reconocibles que no deben llegar a ningún registro.
const EMAIL = "dra.secreta@example.com";
const LICENSE = "MATRICULA-SECRETA-987";

describe("los registros de las invitaciones no llevan datos de la persona ni del link", () => {
  let errors: MockInstance<typeof console.error>;
  let warnings: MockInstance<typeof console.warn>;
  let logs: MockInstance<typeof console.log>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function everythingLogged(): string {
    return [errors, warnings, logs]
      .flatMap((spy) => spy.mock.calls)
      .map((call) => call.map(String).join(" "))
      .join("\n");
  }

  it("generar, vista previa y aceptar, con todos los resultados posibles", async () => {
    const scenario = createInvitationScenario();
    const account = scenario.addAccount("doctor-1", EMAIL, "Dra. Secreta");

    // Un envío que falla con un mensaje que incluye el destinatario.
    scenario.mailer.failWith = new MailDeliveryError("REJECTED");
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: EMAIL, licenseNumber: LICENSE });
    scenario.mailer.failWith = null;
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: EMAIL, licenseNumber: LICENSE });
    // Un conflicto de matrícula.
    const other = scenario.addAccount("doctor-2", "otro@example.com");
    scenario.addStaff(other.id, { isDoctor: true, licenseNumber: "OTRA1" });
    await scenario.createInvitation({
      actor: scenario.adminActor,
      kind: "DOCTOR",
      email: "nuevo@example.com",
      licenseNumber: "OTRA1",
    });

    const token = scenario.lastToken();
    await scenario.previewInvitation({ token, account });
    await scenario.previewInvitation({ token: "inventado", account });
    await scenario.acceptInvitation({ token, account: { ...account }, proof: { licenseNumber: "INCORRECTA", specialty: "Cardiología" } });
    await scenario.acceptInvitation({ token, account: { ...account }, proof: { licenseNumber: LICENSE, specialty: "Cardiología" } });
    await scenario.acceptInvitation({ token, account: { ...account }, proof: { licenseNumber: LICENSE, specialty: "Cardiología" } });

    const logged = everythingLogged();
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("/invite/");
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(LICENSE);
    expect(logged).not.toContain("Cardiología");
  });

  it("un error del repositorio al aceptar no deja datos en los registros", async () => {
    const scenario = createInvitationScenario();
    const account = scenario.addAccount("doctor-1", EMAIL, "Dra. Secreta");
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: EMAIL, licenseNumber: LICENSE });
    const token = scenario.lastToken();
    vi.spyOn(scenario.repo, "runAcceptance").mockRejectedValue(new Error(`falló con ${EMAIL} y ${LICENSE}`));

    await expect(
      scenario.acceptInvitation({ token, account, proof: { licenseNumber: LICENSE, specialty: "Cardiología" } }),
    ).rejects.toThrow();

    expect(everythingLogged()).not.toContain(EMAIL);
    expect(everythingLogged()).not.toContain(LICENSE);
  });
});
