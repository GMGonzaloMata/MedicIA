import type { NewInvitation } from "@/modules/users/application/ports/out/invitation-repository";
import { INVITATION_TTL_MS } from "@/modules/users/domain/invitation";
import { generateInvitationToken, hashInvitationToken } from "@/modules/users/domain/invitation-token";

import {
  createDoctorMembership,
  createStaffMembership,
  createTenant,
  createUser,
} from "./database";

let sequence = 0;

// Dos clínicas, con un administrador y un médico en la A y un médico en la B, para probar invitaciones y el
// aislamiento entre clínicas. Cada cuenta lleva un nombre reconocible.
export async function createInvitationWorld() {
  const tenantA = await createTenant({ name: "Clínica A" });
  const tenantB = await createTenant({ name: "Clínica B" });

  const adminUser = await createUser({ fullName: "Admin de A" });
  const admin = await createStaffMembership({ tenantId: tenantA.id, userId: adminUser.id });

  const doctorUser = await createUser({ fullName: "Doctora de A" });
  const doctor = await createDoctorMembership({ tenantId: tenantA.id, userId: doctorUser.id });

  const outsiderUser = await createUser({ fullName: "Doctor de B" });
  const outsider = await createDoctorMembership({ tenantId: tenantB.id, userId: outsiderUser.id });

  return { tenantA, tenantB, adminUser, admin, doctorUser, doctor, outsiderUser, outsider };
}

export type InvitationWorld = Awaited<ReturnType<typeof createInvitationWorld>>;

// Una invitación de médico, de la clínica A y generada por su administrador, lista para guardar. Cada llamada
// genera su propio token; se devuelve también el token en claro, que solo existe en las pruebas.
export function buildInvitation(
  world: InvitationWorld,
  overrides: Partial<NewInvitation> = {},
  now: Date = new Date(),
): { input: NewInvitation; token: string } {
  sequence += 1;
  const token = generateInvitationToken();

  return {
    token,
    input: {
      tenantId: world.tenantA.id,
      kind: "DOCTOR",
      email: `invitado${sequence}@example.com`,
      tokenHash: hashInvitationToken(token),
      documentType: null,
      documentNumber: null,
      licenseNumber: `MN-${sequence}`,
      createdByMembershipId: world.admin.id,
      createdByUserId: world.adminUser.id,
      assignToCreator: false,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      ...overrides,
    },
  };
}

// Una invitación de paciente generada por el médico de la clínica A, que asigna al médico al aceptarse.
export function buildPatientInvitation(
  world: InvitationWorld,
  overrides: Partial<NewInvitation> = {},
  now: Date = new Date(),
) {
  return buildInvitation(
    world,
    {
      kind: "PATIENT",
      documentType: "DNI",
      documentNumber: `${30000000 + sequence}`,
      licenseNumber: null,
      createdByMembershipId: world.doctor.id,
      createdByUserId: world.doctorUser.id,
      assignToCreator: true,
      ...overrides,
    },
    now,
  );
}
