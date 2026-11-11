import { createEnrollMember } from "@/modules/users/application/use-cases/enroll-member";
import { createResendAccess } from "@/modules/users/application/use-cases/resend-access";
import { createInMemoryIdentityProvider } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";
import { prismaClinicMemberRepository } from "@/modules/users/infrastructure/repositories/prisma-clinic-member-repository";
import { prismaInvitationRepository } from "@/modules/users/infrastructure/repositories/prisma-invitation-repository";
import { prismaUserRepository } from "@/modules/users/infrastructure/repositories/prisma-user-repository";

import { InMemoryInvitationMailer } from "./in-memory/in-memory-invitation-mailer";
import { createStaffMembership, createTenant, createUser } from "./database";

export async function createEnrollmentScenario() {
  const tenant = await createTenant();
  const admin = await createUser();
  const membership = await createStaffMembership({ tenantId: tenant.id, userId: admin.id });
  const actor = { tenantId: tenant.id, userId: admin.id, membershipId: membership.id,
    isClinicAdmin: true, isDoctor: false };
  const identity = createInMemoryIdentityProvider({});
  const mailer = new InMemoryInvitationMailer();
  const now = () => new Date();
  const appBaseUrl = () => "https://medicia.example";
  const enroll = createEnrollMember({ members: prismaClinicMemberRepository, invitations: prismaInvitationRepository,
    users: prismaUserRepository, identity, mailer, appBaseUrl, now });
  const resend = createResendAccess({ members: prismaClinicMemberRepository, identity, mailer, appBaseUrl, now });
  return { tenant, admin, membership, actor, identity, mailer, enroll, resend };
}

export const NEW_PATIENT = { kind: "PATIENT", email: "nuevo@example.com", fullName: "Paciente Nuevo",
  documentType: "DNI", documentNumber: "30111222" } as const;
export const NEW_DOCTOR = { kind: "DOCTOR", email: "medico@example.com", fullName: "Dra. Nueva",
  licenseNumber: "MP-NEW", specialty: "Cardiología" } as const;
