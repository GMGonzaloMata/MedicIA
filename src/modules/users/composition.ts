import "server-only";

import { createIdentityProvider } from "./infrastructure/adapters/create-identity-provider";
import { prismaSessionRepository } from "./infrastructure/repositories/prisma-session-repository";
import { prismaUserRepository } from "./infrastructure/repositories/prisma-user-repository";
import { createConfirmAccount } from "./application/use-cases/confirm-account";
import { createGetAccessContext } from "./application/use-cases/get-access-context";
import { createRegisterAccount } from "./application/use-cases/register-account";
import { createResendConfirmationCode } from "./application/use-cases/resend-confirmation-code";
import { createResolveCurrentSession } from "./application/use-cases/resolve-current-session";
import { createSignIn } from "./application/use-cases/sign-in";

function buildUsersModule() {
  const identity = createIdentityProvider(process.env);
  const now = () => new Date();
  const resolveCurrentSession = createResolveCurrentSession({ sessions: prismaSessionRepository, now });

  return {
    getAccessContext: createGetAccessContext({ resolveCurrentSession }),
    registerAccount: createRegisterAccount({ identity }),
    confirmAccount: createConfirmAccount({ identity }),
    resendConfirmationCode: createResendConfirmationCode({ identity }),
    signIn: createSignIn({
      identity,
      users: prismaUserRepository,
      sessions: prismaSessionRepository,
      now,
    }),
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
