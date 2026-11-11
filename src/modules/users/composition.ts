import "server-only";

import { createIdentityProvider } from "./infrastructure/adapters/create-identity-provider";
import { createInvitationMailer, loadAppBaseUrl } from "./infrastructure/adapters/create-invitation-mailer";
import { prismaInvitationRepository } from "./infrastructure/repositories/prisma-invitation-repository";
import { prismaClinicMemberRepository } from "./infrastructure/repositories/prisma-clinic-member-repository";
import { prismaClinicAccessRepository } from "./infrastructure/repositories/prisma-clinic-access-repository";
import { prismaSessionRepository } from "./infrastructure/repositories/prisma-session-repository";
import { prismaUserRepository } from "./infrastructure/repositories/prisma-user-repository";
import type { InvitationMailer } from "./application/ports/out/invitation-mailer";
import { createAcceptInvitation } from "./application/use-cases/accept-invitation";
import { createConfirmAccount } from "./application/use-cases/confirm-account";
import { createCreateInvitation } from "./application/use-cases/create-invitation";
import { createGetAccessContext } from "./application/use-cases/get-access-context";
import { createListInvitations } from "./application/use-cases/list-invitations";
import { createListClinicStaff } from "./application/use-cases/list-clinic-staff";
import { createListClinicPatients } from "./application/use-cases/list-clinic-patients";
import { createListAvailableClinics } from "./application/use-cases/list-available-clinics";
import { createPreviewInvitation } from "./application/use-cases/preview-invitation";
import { createRegisterAccount } from "./application/use-cases/register-account";
import { createResendConfirmationCode } from "./application/use-cases/resend-confirmation-code";
import { createResolveCurrentSession } from "./application/use-cases/resolve-current-session";
import { createRequestPasswordReset } from "./application/use-cases/request-password-reset";
import { createResetPassword } from "./application/use-cases/reset-password";
import { createRevokeInvitation } from "./application/use-cases/revoke-invitation";
import { createSelectActiveClinic } from "./application/use-cases/select-active-clinic";
import { createSignIn } from "./application/use-cases/sign-in";
import { createSignOut } from "./application/use-cases/sign-out";

function buildUsersModule() {
  const identity = createIdentityProvider(process.env);
  const now = () => new Date();
  let invitationMailer: InvitationMailer | undefined;
  let appBaseUrl: string | undefined;
  const resolveCurrentSession = createResolveCurrentSession({ sessions: prismaSessionRepository, now });
  const mailer = () => (invitationMailer ??= createInvitationMailer(process.env));
  const lazyMailer: InvitationMailer = {
    send: (email) => mailer().send(email),
    sendAccessNotice: (notice) => mailer().sendAccessNotice(notice),
  };

  return {
    getAccessContext: createGetAccessContext({ resolveCurrentSession }),
    registerAccount: createRegisterAccount({ identity }),
    confirmAccount: createConfirmAccount({ identity }),
    resendConfirmationCode: createResendConfirmationCode({ identity }),
    signIn: createSignIn({
      identity,
      users: prismaUserRepository,
      sessions: prismaSessionRepository,
      clinicAccess: prismaClinicAccessRepository,
      now,
    }),
    signOut: createSignOut({ sessions: prismaSessionRepository, now }),
    requestPasswordReset: createRequestPasswordReset({ identity }),
    resetPassword: createResetPassword({ identity, users: prismaUserRepository, now }),
    listAvailableClinics: createListAvailableClinics({ clinicAccess: prismaClinicAccessRepository }),
    selectActiveClinic: createSelectActiveClinic({
      resolveCurrentSession,
      clinicAccess: prismaClinicAccessRepository,
      sessions: prismaSessionRepository,
    }),
    // El correo y la dirección pública se arman al invitar por primera vez, no al armar el módulo: si faltan sus
    // variables, solo falla invitar y no el ingreso ni el resto de la aplicación.
    createInvitation: createCreateInvitation({
      invitations: prismaInvitationRepository,
      mailer: lazyMailer,
      appBaseUrl: () => (appBaseUrl ??= loadAppBaseUrl(process.env)),
      now,
    }),
    previewInvitation: createPreviewInvitation({ invitations: prismaInvitationRepository, now }),
    acceptInvitation: createAcceptInvitation({ invitations: prismaInvitationRepository, now }),
    listInvitations: createListInvitations({ invitations: prismaInvitationRepository, now }),
    listClinicStaff: createListClinicStaff({ members: prismaClinicMemberRepository }),
    listClinicPatients: createListClinicPatients({ members: prismaClinicMemberRepository }),
    revokeInvitation: createRevokeInvitation({ invitations: prismaInvitationRepository, now }),
  };
}

type UsersModule = ReturnType<typeof buildUsersModule>;

// El módulo se arma la primera vez que se usa, no al importar el archivo, para que `next build`
// no falle si faltan variables de entorno. Se guarda en `globalThis` porque Next puede cargar este
// archivo más de una vez (una por ruta o por recarga), y el proveedor simulado guarda sus cuentas en
// memoria: con varias copias, un registro y un ingreso no se verían entre sí.
// El `as unknown as` solo declara esa propiedad extra; el valor guardado siempre es un UsersModule.
const globalForUsers = globalThis as unknown as { usersModule?: UsersModule };

export function getUsersModule(): UsersModule {
  globalForUsers.usersModule ??= buildUsersModule();

  return globalForUsers.usersModule;
}
