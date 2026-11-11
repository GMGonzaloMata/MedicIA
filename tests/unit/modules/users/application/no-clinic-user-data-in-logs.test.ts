import { afterEach, describe, expect, it, vi } from "vitest";

import { createEnrollMember } from "@/modules/users/application/use-cases/enroll-member";
import { createResendAccess } from "@/modules/users/application/use-cases/resend-access";
import { createInMemoryIdentityProvider } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";
import type { UserRepository } from "@/modules/users/application/ports/out/user-repository";

import { InMemoryClinicMemberRepository } from "../../../../support/in-memory/in-memory-clinic-member-repository";
import { createInvitationScenario } from "../../../../support/invitation-scenario";

afterEach(() => vi.restoreAllMocks());

describe("registros del alta y reenvío", () => {
  it("no escriben correos, documentos, matrículas ni respuestas externas", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const scenario = createInvitationScenario();
    const members = new InMemoryClinicMemberRepository(scenario.repo);
    const identity = createInMemoryIdentityProvider({});
    const users: UserRepository = {
      async findByEmail() { return null; },
      async upsertFromIdentity() { throw new Error("No se usa."); },
      async invalidateSessionsByEmail() {},
    };
    const enroll = createEnrollMember({ members, invitations: scenario.repo, users, identity,
      mailer: scenario.mailer, appBaseUrl: () => "https://medicia.example", now: scenario.now });
    const resend = createResendAccess({ members, identity, mailer: scenario.mailer,
      appBaseUrl: () => "https://medicia.example", now: scenario.now });
    const patient = { kind: "PATIENT", email: "secreto@example.com", fullName: "Persona Secreta",
      documentType: "DNI", documentNumber: "12345678" } as const;
    const doctor = { kind: "DOCTOR", email: "medico-secreto@example.com", fullName: "Dra. Secreta",
      specialty: "Cardiología", licenseNumber: "MP-SECRETA-123" } as const;
    const result = await enroll({ actor: scenario.adminActor, ...patient });
    await enroll({ actor: scenario.adminActor, ...doctor });
    if (result.status === "ENROLLED") {
      await resend({ actor: scenario.adminActor, target: { kind: "PATIENT", patientId: result.relationshipId } });
    }
    vi.spyOn(identity, "provisionAccount").mockRejectedValueOnce(new Error("código 999999"));
    await enroll({ actor: scenario.adminActor, ...patient, email: "otro-secreto@example.com", documentNumber: "99999999" });
    const logged = [error, warn, log].flatMap((spy) => spy.mock.calls).map((call) => call.map(String).join(" ")).join("\n");
    for (const secret of ["secreto@example.com", "12345678", "MP-SECRETA-123", "999999"]) {
      expect(logged).not.toContain(secret);
    }
  });
});
