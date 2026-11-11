import { prismaClient } from "@/infrastructure/database/prisma-client";

import { SESSION_ABSOLUTE_TIMEOUT_MS } from "@/modules/users/domain/session-policy";

import type { Prisma } from "../../generated/prisma/client";
import { assertLocalDatabaseUrl } from "./local-database";

export { prismaClient };

let sequence = 0;

function nextSequence(): number {
  sequence += 1;
  return sequence;
}

// Vacía las nueve tablas en una sola sentencia, porque PostgreSQL no vacía una tabla referenciada por otra
// que quede afuera. Se niega a correr si la base no es local.
export async function resetDatabase(): Promise<void> {
  assertLocalDatabaseUrl(process.env.DATABASE_URL);

  await prismaClient.$executeRaw`
    TRUNCATE TABLE
      "analyses",
      "studies",
      "study_counters",
      "sessions",
      "doctor_patient_assignments",
      "patients",
      "staff_memberships",
      "users",
      "tenants"
  `;
}

export function createTenant(overrides: Partial<Prisma.TenantUncheckedCreateInput> = {}) {
  const number = nextSequence();

  return prismaClient.tenant.create({
    data: { name: `Clínica ${number}`, ...overrides },
  });
}

export function createUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const number = nextSequence();

  return prismaClient.user.create({
    data: {
      cognitoSub: `sub-${number}`,
      email: `usuario${number}@example.com`,
      fullName: `Usuario ${number}`,
      ...overrides,
    },
  });
}

type MembershipInput = Pick<Prisma.StaffMembershipUncheckedCreateInput, "tenantId" | "userId"> &
  Partial<Prisma.StaffMembershipUncheckedCreateInput>;

// Por defecto es un administrador de clínica sin datos de médico, que es una combinación válida.
export function createStaffMembership(input: MembershipInput) {
  return prismaClient.staffMembership.create({
    data: { isClinicAdmin: true, isDoctor: false, ...input },
  });
}

export function createDoctorMembership(input: MembershipInput) {
  const number = nextSequence();

  return prismaClient.staffMembership.create({
    data: {
      isClinicAdmin: false,
      isDoctor: true,
      specialty: "Cardiología",
      licenseNumber: `MP-${number}`,
      ...input,
    },
  });
}

type PatientInput = Pick<Prisma.PatientUncheckedCreateInput, "tenantId"> &
  Partial<Prisma.PatientUncheckedCreateInput>;

// Por defecto es un paciente pendiente, sin cuenta ni nombre, que es una combinación válida.
export function createPatient(input: PatientInput) {
  const number = nextSequence();

  return prismaClient.patient.create({
    data: { documentType: "DNI", documentNumber: `${number}`, ...input },
  });
}

export function createLinkedPatient(
  input: PatientInput & Pick<Prisma.PatientUncheckedCreateInput, "userId">,
) {
  const number = nextSequence();

  return createPatient({
    status: "LINKED",
    fullName: `Paciente ${number}`,
    linkedAt: new Date(),
    ...input,
  });
}

type AssignmentInput = Pick<
  Prisma.DoctorPatientAssignmentUncheckedCreateInput,
  "tenantId" | "membershipId" | "patientId" | "createdByUserId"
> &
  Partial<Prisma.DoctorPatientAssignmentUncheckedCreateInput>;

// `createdAt` se fija con el reloj de la aplicación, igual que `endedAt`, para que un desfase
// con el reloj de la base no rompa la regla "el fin no es anterior al inicio".
export function createAssignment(input: AssignmentInput) {
  return prismaClient.doctorPatientAssignment.create({ data: { createdAt: new Date(), ...input } });
}

type SessionInput = Pick<Prisma.SessionUncheckedCreateInput, "userId"> &
  Partial<Prisma.SessionUncheckedCreateInput>;

// Por defecto es una sesión recién creada, sin vínculo activo. Las fechas usan el reloj de la
// aplicación, como el código real, y el hash es único de 64 caracteres.
export function createSession(input: SessionInput) {
  const number = nextSequence();
  const now = new Date();

  return prismaClient.session.create({
    data: {
      tokenHash: number.toString(16).padStart(64, "0"),
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      ...input,
    },
  });
}
