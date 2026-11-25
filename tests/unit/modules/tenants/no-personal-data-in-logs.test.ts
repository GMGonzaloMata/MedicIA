import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAcceptStaffInvitation } from "@/modules/tenants/application/use-cases/accept-staff-invitation";
import { createAssignPatient } from "@/modules/tenants/application/use-cases/assign-patient";
import { createDeactivateMember } from "@/modules/tenants/application/use-cases/deactivate-member";
import { createInviteStaff } from "@/modules/tenants/application/use-cases/invite-staff";
import { createLinkPatientAccount } from "@/modules/tenants/application/use-cases/link-patient-account";
import { createReactivateMember } from "@/modules/tenants/application/use-cases/reactivate-member";
import { createRegeneratePatientLinkCode } from "@/modules/tenants/application/use-cases/regenerate-patient-link-code";
import { createRegisterPatient } from "@/modules/tenants/application/use-cases/register-patient";
import { createResendInvitation } from "@/modules/tenants/application/use-cases/resend-invitation";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { MailDeliveryError } from "@/modules/tenants/domain/mail-errors";

import { createDeterministicSecretGenerator } from "../../../support/in-memory/deterministic-secret-generator";
import { createInMemoryAssignmentRepository } from "../../../support/in-memory/in-memory-assignment-repository";
import { createInMemoryClinicStore } from "../../../support/in-memory/in-memory-clinic-store";
import { createInMemoryLinkAttemptRepository } from "../../../support/in-memory/in-memory-link-attempt-repository";
import { createInMemoryPatientRegistry } from "../../../support/in-memory/in-memory-patient-registry-repository";

// SC-008 y FR-014: ningún registro de esta funcionalidad contiene correos, documentos, nombres, tokens ni códigos.
const NOW = new Date("2026-11-23T12:00:00.000Z");
const ACTOR: ClinicAdminActor = { tenantId: "tenant-a", userId: "admin-a", membershipId: "membership-1" };
const INVITED_EMAIL = "persona.invitada@example.com";
const DOCUMENT = "30123456";
const LICENSE = "MP-99887";
const FULL_NAME = "Ana Paciente Secreta";

const CHANNELS = ["log", "info", "warn", "error", "debug"] as const;

function spyOnConsole() {
  return CHANNELS.map((channel) => vi.spyOn(console, channel).mockImplementation(() => undefined));
}

function capturedOutput(spies: ReturnType<typeof spyOnConsole>): string {
  return spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join("\n");
}

let spies: ReturnType<typeof spyOnConsole>;

beforeEach(() => {
  spies = spyOnConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("los casos de uso no registran datos personales", () => {
  it("recorre invitar, aceptar, registrar, vincular, asignar y desactivar, con fallos incluidos", async () => {
    const clinic = createInMemoryClinicStore();
    clinic.addTenant({ id: "tenant-a", name: "Clínica A" });
    clinic.addUser({ id: "admin-a", email: "admin-a@example.com", fullName: "Admin A" });
    clinic.addUser({ id: "invitee", email: INVITED_EMAIL, fullName: FULL_NAME });
    clinic.addMembership({ tenantId: "tenant-a", userId: "admin-a", roles: { isClinicAdmin: true, isDoctor: false } });

    const secrets = createDeterministicSecretGenerator();
    const attempts = createInMemoryLinkAttemptRepository();
    const registry = createInMemoryPatientRegistry(clinic, attempts.attempts);
    const assignments = createInMemoryAssignmentRepository(clinic, registry);
    const now = () => NOW;
    let failMail = false;
    const mailer = {
      async send() {
        if (failMail) {
          throw new MailDeliveryError();
        }
      },
    };
    const inviteStaff = createInviteStaff({
      staff: clinic.staff,
      invitations: clinic.invitations,
      mailer,
      secrets,
      now,
      appBaseUrl: "https://app.example.com",
    });

    // Invitar (éxito, rechazo y correo caído), reenviar y aceptar.
    const profile = { specialty: "Cardiología", licenseNumber: LICENSE };
    const roles = { isClinicAdmin: false, isDoctor: true };
    await inviteStaff({ actor: ACTOR, email: INVITED_EMAIL, roles, doctor: profile });
    await inviteStaff({ actor: ACTOR, email: "no-es-un-correo", roles, doctor: profile });
    await inviteStaff({ actor: ACTOR, email: INVITED_EMAIL, roles, doctor: profile }).catch(() => undefined);
    failMail = true;
    const failed = await inviteStaff({ actor: ACTOR, email: "otra@example.com", roles: { isClinicAdmin: true, isDoctor: false } });
    failMail = false;
    if (!failed.ok && failed.code === "MAIL_UNAVAILABLE") {
      await createResendInvitation({ invitations: clinic.invitations, inviteStaff })({
        actor: ACTOR,
        invitationId: failed.invitationId,
      });
    }
    const accept = createAcceptStaffInvitation({ invitations: clinic.invitations, secrets, now });
    await accept({ token: secrets.issuedTokens.at(-1) ?? "x", user: { id: "invitee", email: INVITED_EMAIL } });
    await accept({ token: "token-inexistente", user: { id: "invitee", email: INVITED_EMAIL } });

    // Pacientes: alta, duplicado, código nuevo, vínculo (éxito y fallos), límite y asignación.
    const registerPatient = createRegisterPatient({ patients: registry.repository, staff: clinic.staff, secrets, now });
    const registered = await registerPatient({ actor: ACTOR, documentType: "DNI", documentNumber: DOCUMENT });
    await registerPatient({ actor: ACTOR, documentType: "DNI", documentNumber: DOCUMENT });
    await registerPatient({ actor: ACTOR, documentType: "CUIT", documentNumber: DOCUMENT });
    if (!registered.ok) {
      throw new Error("No se pudo registrar al paciente de prueba.");
    }
    const link = createLinkPatientAccount({ patients: registry.repository, attempts, secrets, now });
    const user = { id: "patient-user", fullName: FULL_NAME };
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await link({ user, documentType: "DNI", documentNumber: DOCUMENT, code: "ZZZZZ-ZZZZZ" });
    }
    await createRegeneratePatientLinkCode({ patients: registry.repository, secrets, now })({
      actor: ACTOR,
      patientId: registered.patientId,
    });
    const doctor = clinic.memberships.find((row) => row.roles.isDoctor);
    if (doctor) {
      await createAssignPatient({ assignments })({ actor: ACTOR, patientId: registered.patientId, membershipId: doctor.id });
      await createDeactivateMember({ staff: clinic.staff, now })({ actor: ACTOR, membershipId: doctor.id });
      await createReactivateMember({ staff: clinic.staff })({ actor: ACTOR, membershipId: doctor.id });
    }

    const output = capturedOutput(spies);
    const sensitive = [INVITED_EMAIL, "otra@example.com", DOCUMENT, FULL_NAME, LICENSE, "Cardiología", ...secrets.issuedTokens, ...secrets.issuedLinkCodes, registered.linkCode];

    for (const value of sensitive) {
      expect(output).not.toContain(value);
    }
    // Más estricto: los casos de uso ni siquiera escriben en la consola.
    expect(output).toBe("");
  });
});

// Regla de código: el único registro permitido es el de errores inesperados, que solo lleva el nombre del error.
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe("el código nuevo no escribe datos en la consola", () => {
  const files = [
    ...sourceFiles("src/modules/tenants"),
    ...sourceFiles("src/app/(dashboard)/clinic"),
    ...sourceFiles("src/app/(dashboard)/invitation"),
    ...sourceFiles("src/app/(dashboard)/link-patient"),
  ];

  it("solo hay un registro y es el de errores inesperados, con el nombre del error", () => {
    const lines = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /console\./.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("action-support.ts");
    expect(lines[0]).toContain("error instanceof Error ? error.name");
  });
});
