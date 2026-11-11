import { createAcceptInvitation } from "@/modules/users/application/use-cases/accept-invitation";
import { createCreateInvitation } from "@/modules/users/application/use-cases/create-invitation";
import { createPreviewInvitation } from "@/modules/users/application/use-cases/preview-invitation";
import type { InvitationActor } from "@/modules/users/domain/invitation-access";

import { InMemoryInvitationMailer } from "./in-memory/in-memory-invitation-mailer";
import { InMemoryInvitationRepository } from "./in-memory/in-memory-invitation-repository";

export const TENANT_ID = "tenant-1";
export const OTHER_TENANT_ID = "tenant-2";
export const APP_BASE_URL = "https://medicia.example";

// Una clínica con un administrador, el repositorio y el correo en memoria y los tres casos de uso armados con un reloj
// que las pruebas pueden adelantar. Cada prueba arma el suyo.
export function createInvitationScenario() {
  const repo = new InMemoryInvitationRepository();
  const mailer = new InMemoryInvitationMailer();
  let current = new Date("2026-11-11T12:00:00.000Z");
  const now = () => current;

  repo.tenants.set(TENANT_ID, { name: "Clínica del Sol", isActive: true });
  repo.tenants.set(OTHER_TENANT_ID, { name: "Clínica Norte", isActive: true });

  function addAccount(id: string, email: string, fullName = "Persona") {
    repo.accounts.set(id, { email, fullName });

    return { id, email, fullName };
  }

  function addStaff(
    userId: string,
    overrides: Partial<{
      tenantId: string;
      status: "ACTIVE" | "DEACTIVATED";
      isClinicAdmin: boolean;
      isDoctor: boolean;
      licenseNumber: string | null;
    }> = {},
  ) {
    const membershipId = `membership-of-${userId}-${repo.staff.length}`;
    repo.staff.push({
      membershipId,
      tenantId: TENANT_ID,
      userId,
      status: "ACTIVE",
      isClinicAdmin: false,
      isDoctor: false,
      licenseNumber: null,
      specialty: null,
      ...overrides,
    });

    return membershipId;
  }

  const admin = addAccount("admin-1", "admin@clinica.example", "Ana Admin");
  const adminMembershipId = addStaff(admin.id, { isClinicAdmin: true });
  const adminActor: InvitationActor = {
    tenantId: TENANT_ID,
    userId: admin.id,
    membershipId: adminMembershipId,
    isClinicAdmin: true,
    isDoctor: false,
  };

  return {
    repo,
    mailer,
    admin,
    adminMembershipId,
    adminActor,
    addAccount,
    addStaff,
    advance(milliseconds: number) {
      current = new Date(current.getTime() + milliseconds);
    },
    now,
    createInvitation: createCreateInvitation({ invitations: repo, mailer, appBaseUrl: () => APP_BASE_URL, now }),
    previewInvitation: createPreviewInvitation({ invitations: repo, now }),
    acceptInvitation: createAcceptInvitation({ invitations: repo, now }),
    // El token del último correo enviado: es lo único que la persona recibe.
    lastToken(): string {
      const link = mailer.sent.at(-1)?.link ?? "";

      return link.slice(link.lastIndexOf("/invite/") + "/invite/".length);
    },
  };
}

export type InvitationScenario = ReturnType<typeof createInvitationScenario>;
