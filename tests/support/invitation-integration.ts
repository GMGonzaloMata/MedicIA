import { createAcceptInvitation } from "@/modules/users/application/use-cases/accept-invitation";
import { createCreateInvitation } from "@/modules/users/application/use-cases/create-invitation";
import { createPreviewInvitation } from "@/modules/users/application/use-cases/preview-invitation";
import type { InvitationActor } from "@/modules/users/domain/invitation-access";
import { prismaInvitationRepository } from "@/modules/users/infrastructure/repositories/prisma-invitation-repository";

import { InMemoryInvitationMailer } from "./in-memory/in-memory-invitation-mailer";
import type { InvitationWorld } from "./invitation-world";

// Los casos de uso de invitaciones con el repositorio de Prisma real y el correo en memoria, para las pruebas de
// integración contra la base.
export function createInvitationUseCases() {
  const mailer = new InMemoryInvitationMailer();
  const now = () => new Date();

  return {
    mailer,
    createInvitation: createCreateInvitation({
      invitations: prismaInvitationRepository,
      mailer,
      appBaseUrl: () => "https://medicia.example",
      now,
    }),
    previewInvitation: createPreviewInvitation({ invitations: prismaInvitationRepository, now }),
    acceptInvitation: createAcceptInvitation({ invitations: prismaInvitationRepository, now }),
    // El token del último correo enviado: es lo único que la persona recibe.
    lastToken(): string {
      const link = mailer.sent.at(-1)?.link ?? "";

      return link.slice(link.lastIndexOf("/invite/") + "/invite/".length);
    },
  };
}

// El administrador de la clínica A del mundo de pruebas, como actor.
export function adminActorOf(world: InvitationWorld): InvitationActor {
  return {
    tenantId: world.tenantA.id,
    userId: world.adminUser.id,
    membershipId: world.admin.id,
    isClinicAdmin: true,
    isDoctor: false,
  };
}
