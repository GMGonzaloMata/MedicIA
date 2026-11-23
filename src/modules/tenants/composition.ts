import "server-only";

import { createAcceptStaffInvitation } from "./application/use-cases/accept-staff-invitation";
import { createInviteStaff } from "./application/use-cases/invite-staff";
import { createListStaff } from "./application/use-cases/list-staff";
import { createResendInvitation } from "./application/use-cases/resend-invitation";
import { createRevokeInvitation } from "./application/use-cases/revoke-invitation";
import { createInvitationMailer } from "./infrastructure/adapters/create-invitation-mailer";
import { nodeSecretGenerator } from "./infrastructure/adapters/node-secret-generator";
import { prismaInvitationRepository } from "./infrastructure/repositories/prisma-invitation-repository";
import { prismaStaffRepository } from "./infrastructure/repositories/prisma-staff-repository";

const APP_BASE_URL_VARIABLE = "APP_BASE_URL";

// Origen público con el que se arman los enlaces de los correos. Sin él no hay forma de armar un enlace válido.
function readAppBaseUrl(env: Record<string, string | undefined>): string {
  const value = env[APP_BASE_URL_VARIABLE];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${APP_BASE_URL_VARIABLE}.`);
  }

  return value;
}

// Casos de uso del módulo de administración de la clínica. Cada historia agrega los suyos.
function buildTenantsModule() {
  const now = () => new Date();
  const secrets = nodeSecretGenerator;
  const mailer = createInvitationMailer(process.env);
  const staff = prismaStaffRepository;
  const invitations = prismaInvitationRepository;
  const inviteStaff = createInviteStaff({
    staff,
    invitations,
    mailer,
    secrets,
    now,
    appBaseUrl: readAppBaseUrl(process.env),
  });

  return {
    inviteStaff,
    listStaff: createListStaff({ staff, invitations, now }),
    revokeInvitation: createRevokeInvitation({ invitations, now }),
    resendInvitation: createResendInvitation({ invitations, inviteStaff }),
    acceptStaffInvitation: createAcceptStaffInvitation({ invitations, secrets, now }),
  };
}

type TenantsModule = ReturnType<typeof buildTenantsModule>;

// El módulo se arma la primera vez que se usa, no al importar el archivo, para que `next build` no falle si
// faltan variables de entorno. Se guarda en `globalThis` porque Next puede cargar este archivo más de una vez
// (una por ruta o por recarga), y el correo simulado y los repositorios en memoria no deben duplicarse.
// El `as unknown as` solo declara esa propiedad extra; el valor guardado siempre es un TenantsModule.
const globalForTenants = globalThis as unknown as { tenantsModule?: TenantsModule };

export function getTenantsModule(): TenantsModule {
  globalForTenants.tenantsModule ??= buildTenantsModule();

  return globalForTenants.tenantsModule;
}
