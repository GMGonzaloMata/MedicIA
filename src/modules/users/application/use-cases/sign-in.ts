import { normalizeEmail } from "../../domain/email";
import { SESSION_ABSOLUTE_TIMEOUT_MS } from "../../domain/session-policy";
import { generateSessionToken, hashSessionToken } from "../../domain/session-token";
import type { IdentityProvider } from "../ports/out/identity-provider";
import type { SessionRepository } from "../ports/out/session-repository";
import type { UserRepository } from "../ports/out/user-repository";

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignInResult {
  // Identificador para la cookie. Se entrega una sola vez: la base solo guarda su hash.
  token: string;
  expiresAt: Date;
}

interface SignInDependencies {
  identity: IdentityProvider;
  users: UserRepository;
  sessions: SessionRepository;
  now: () => Date;
}

// Valida la identidad, crea la cuenta propia en el primer ingreso y abre una sesión sin clínica activa.
export function createSignIn({ identity, users, sessions, now }: SignInDependencies) {
  return async (input: SignInInput): Promise<SignInResult> => {
    const verified = await identity.signIn({
      email: normalizeEmail(input.email),
      password: input.password,
    });

    // Una sola hora para la cuenta y la sesión: así la sesión del primer ingreso nunca nace
    // anterior a la fecha desde la cual las sesiones de la cuenta son válidas.
    const startedAt = now();
    const user = await users.upsertFromIdentity({
      subject: verified.subject,
      email: verified.email,
      fullName: verified.fullName,
      now: startedAt,
    });

    const token = generateSessionToken();
    const expiresAt = new Date(startedAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);

    await sessions.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      now: startedAt,
      expiresAt,
    });

    return { token, expiresAt };
  };
}
