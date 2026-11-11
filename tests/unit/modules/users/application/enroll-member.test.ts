import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEnrollMember } from "@/modules/users/application/use-cases/enroll-member";
import type { UserRepository } from "@/modules/users/application/ports/out/user-repository";
import { createInMemoryIdentityProvider } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";
import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";

import { InMemoryClinicMemberRepository } from "../../../../support/in-memory/in-memory-clinic-member-repository";
import { APP_BASE_URL, createInvitationScenario } from "../../../../support/invitation-scenario";

const DOCTOR = { kind: "DOCTOR", email: "doctor@example.com", fullName: "Dra. Sol Pérez",
  licenseNumber: "MN 123", specialty: "Cardiología" } as const;
const PATIENT = { kind: "PATIENT", email: "paciente@example.com", fullName: "Pablo Pérez",
  documentType: "DNI", documentNumber: "30.123.456" } as const;

function setup() {
  const scenario = createInvitationScenario();
  const members = new InMemoryClinicMemberRepository(scenario.repo);
  const identity = createInMemoryIdentityProvider({});
  const provision = vi.spyOn(identity, "provisionAccount");
  const users: UserRepository = {
    async findByEmail(email) {
      const entry = [...scenario.repo.accounts.entries()].find(([, account]) => account.email === email);
      return entry ? { id: entry[0], ...entry[1], isPlatformAdmin: false } : null;
    },
    async upsertFromIdentity() { throw new Error("No se usa fuera de la transacción."); },
    async invalidateSessionsByEmail() {},
  };
  const enroll = createEnrollMember({ members, invitations: scenario.repo, users, identity,
    mailer: scenario.mailer, appBaseUrl: () => APP_BASE_URL, now: scenario.now });
  return { ...scenario, members, identity, provision, enroll };
}

let test: ReturnType<typeof setup>;
beforeEach(() => { test = setup(); });

describe("alta directa", () => {
  it("el administrador da de alta médicos y pacientes sin asignarse como médico", async () => {
    const doctor = await test.enroll({ actor: test.adminActor, ...DOCTOR });
    const patient = await test.enroll({ actor: test.adminActor, ...PATIENT });
    expect(doctor).toMatchObject({ status: "ENROLLED", kind: "DOCTOR", mail: "SENT", assignedToDoctor: false });
    expect(patient).toMatchObject({ status: "ENROLLED", kind: "PATIENT", mail: "SENT", assignedToDoctor: false });
    expect(test.repo.staff).toHaveLength(2);
    expect(test.repo.patients).toHaveLength(1);
    expect(test.repo.assignments).toHaveLength(0);
    expect(test.mailer.notices).toEqual([
      expect.objectContaining({ to: DOCTOR.email, setPasswordUrl: `${APP_BASE_URL}/verify-email` }),
      expect.objectContaining({ to: PATIENT.email, setPasswordUrl: `${APP_BASE_URL}/verify-email` }),
    ]);
    expect(test.members.events.map((event) => event.action)).toEqual(["STAFF_ENROLLED", "PATIENT_ENROLLED"]);
  });

  it("un médico solo da de alta pacientes y queda asignado", async () => {
    const doctor = test.addDoctor();
    expect(await test.enroll({ actor: doctor.actor, ...DOCTOR })).toEqual({ status: "FORBIDDEN" });
    const result = await test.enroll({ actor: doctor.actor, ...PATIENT });
    expect(result).toMatchObject({ status: "ENROLLED", assignedToDoctor: true });
    expect(test.repo.assignments).toHaveLength(1);
    expect(test.members.events.map((event) => event.action)).toEqual(["PATIENT_ENROLLED", "ASSIGNMENT_CREATED"]);
  });

  it("una cuenta existente conserva el nombre y la respuesta no revela su existencia", async () => {
    const created = await test.enroll({ actor: test.adminActor, ...PATIENT });
    const other = test.addAccount("existing", "existing@example.com", "Nombre anterior");
    const existing = await test.enroll({ actor: test.adminActor, ...PATIENT,
      email: other.email, documentNumber: "99.999.999", fullName: "Nombre nuevo" });
    expect(created.status).toBe("ENROLLED");
    expect(existing.status).toBe("ENROLLED");
    expect(test.provision).toHaveBeenCalledTimes(1);
    expect(test.repo.accounts.get(other.id)?.fullName).toBe("Nombre anterior");
    expect(test.mailer.notices.at(-1)?.setPasswordUrl).toBeNull();
    expect(Object.keys(created).sort()).toEqual(Object.keys(existing).sort());
  });

  it("un alta repetida no duplica vínculos ni eventos; un médico agrega su asignación una sola vez", async () => {
    await test.enroll({ actor: test.adminActor, ...PATIENT });
    const doctor = test.addDoctor();
    expect(await test.enroll({ actor: doctor.actor, ...PATIENT })).toEqual({ status: "ALREADY_MEMBER", assignedToDoctor: true });
    expect(await test.enroll({ actor: doctor.actor, ...PATIENT })).toEqual({ status: "ALREADY_MEMBER", assignedToDoctor: false });
    expect(test.repo.assignments).toHaveLength(1);
    expect(test.members.events.map((event) => event.action)).toEqual(["PATIENT_ENROLLED", "ASSIGNMENT_CREATED"]);
  });

  it("devuelve conflictos de la clínica, sin llamar a la identidad", async () => {
    const owner = test.addAccount("owner", "owner@example.com");
    test.addStaff(owner.id, { isDoctor: true, licenseNumber: "MN123" });
    expect(await test.enroll({ actor: test.adminActor, ...DOCTOR })).toEqual({ status: "CONFLICT", reason: "LICENSE_IN_USE" });
    expect(test.provision).not.toHaveBeenCalled();
  });

  it("rechaza el vínculo opuesto, la membresía desactivada y el cambio de rol", async () => {
    const staffAccount = test.addAccount("staff", PATIENT.email);
    test.addStaff(staffAccount.id, { isDoctor: true, licenseNumber: "MP-STAFF" });
    expect(await test.enroll({ actor: test.adminActor, ...PATIENT })).toEqual({ status: "CONFLICT", reason: "ALREADY_STAFF" });

    const patientAccount = test.addAccount("patient", DOCTOR.email);
    test.repo.patients.push({ patientId: "patient-1", tenantId: test.adminActor.tenantId,
      userId: patientAccount.id, status: "LINKED", documentType: "DNI", documentNumber: "111",
      fullName: "Paciente" });
    expect(await test.enroll({ actor: test.adminActor, ...DOCTOR })).toEqual({ status: "CONFLICT", reason: "ALREADY_PATIENT" });

    const inactive = test.addAccount("inactive", "inactive@example.com");
    test.addStaff(inactive.id, { isDoctor: true, licenseNumber: "MP-INACTIVE", status: "DEACTIVATED" });
    expect(await test.enroll({ actor: test.adminActor, ...DOCTOR,
      email: inactive.email, licenseNumber: "MP-INACTIVE" })).toEqual({ status: "CONFLICT", reason: "MEMBERSHIP_DEACTIVATED" });

    expect(await test.enroll({ actor: test.adminActor, ...DOCTOR,
      email: test.admin.email, licenseNumber: "MP-ADMIN" })).toEqual({ status: "CONFLICT", reason: "ROLE_CHANGE_NOT_SUPPORTED" });
    expect(test.provision).not.toHaveBeenCalled();
  });

  it("rechaza un documento ajeno en la clínica y no toma los de otra clínica como conflicto", async () => {
    const other = test.addAccount("document-owner", "owner@example.com");
    test.repo.patients.push({ patientId: "owner-patient", tenantId: test.adminActor.tenantId,
      userId: other.id, status: "LINKED", documentType: "DNI", documentNumber: "30123456", fullName: "Otra" });
    expect(await test.enroll({ actor: test.adminActor, ...PATIENT })).toEqual({ status: "CONFLICT", reason: "DOCUMENT_IN_USE" });
    const ownerPatient = test.repo.patients[0];
    if (!ownerPatient) throw new Error("Falta el paciente de prueba.");
    ownerPatient.tenantId = "tenant-2";
    expect((await test.enroll({ actor: test.adminActor, ...PATIENT })).status).toBe("ENROLLED");
  });

  it("si falla la identidad no escribe; si falla el correo conserva el alta", async () => {
    test.provision.mockRejectedValueOnce(new Error("secreto de identidad"));
    expect(await test.enroll({ actor: test.adminActor, ...PATIENT })).toEqual({ status: "UNAVAILABLE" });
    expect(test.repo.patients).toHaveLength(0);
    expect(test.members.events).toHaveLength(0);
    test.mailer.failWith = new MailDeliveryError("UNAVAILABLE");
    expect(await test.enroll({ actor: test.adminActor, ...PATIENT })).toMatchObject({ status: "ENROLLED", mail: "FAILED" });
    expect(test.repo.patients).toHaveLength(1);
  });

  it("valida campos antes de consultar o escribir", async () => {
    expect(await test.enroll({ actor: test.adminActor, ...PATIENT, email: "mal", fullName: "" })).toMatchObject({ status: "INVALID_INPUT" });
    expect(test.provision).not.toHaveBeenCalled();
    expect(test.repo.patients).toHaveLength(0);
  });
});
