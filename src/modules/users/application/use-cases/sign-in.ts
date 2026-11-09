import { normalizeEmail } from "../../domain/email";
import { SESSION_ABSOLUTE_TIMEOUT_MS } from "../../domain/session-policy";
import { generateSessionToken, hashSessionToken } from "../../domain/session-token";
import type { ClinicAccessRepository } from "../ports/out/clinic-access-repository";
import type { IdentityProvider } from "../ports/out/identity-provider";
import type { SessionRepository } from "../ports/out/session-repository";
import type { UserRepository } from "../ports/out/user-repository";

export interface SignInInput {
  email: string;
  password: string;
}

// A dónde llevar a la persona al terminar de ingresar (spec FR-019).
export type SignInNextStep = "HOME" | "SELECT_CLINIC" | "NO_ACCESS";

export interface SignInResult {
  // Identificador para la cookie. Se entrega una sola vez: la base solo guarda su hash.
  token: string;
  expiresAt: Date;
  nextStep: SignInNextStep;
}

interface SignInDependencies {
  identity: IdentityProvider;
  users: UserRepository;
  sessions: SessionRepository;
  clinicAccess: ClinicAccessRepository;
  now: () => Date;
}

// Valida la identidad, crea la cuenta propia en el primer ingreso y abre una sesión. Si la persona
// tiene una sola clínica disponible la deja activa; si tiene varias, deberá elegir; si no tiene, no
// hay acceso todavía.
export function createSignIn({ identity, users, sessions, clinicAccess, now }: SignInDependencies) {
  return async (input: SignInInput): Promise<SignInResult> => {
    // Una sola hora para la cuenta y la sesión: así la sesión del primer ingreso nunca nace
    // anterior a la fecha desde la cual las sesiones de la cuenta son válidas. Se toma antes de
    // consultar al proveedor, para que un ingreso con la contraseña anterior que se resuelva justo
    // antes de un restablecimiento no quede con una fecha posterior a la invalidación.
    const startedAt = now();
    const verified = await identity.signIn({
      email: normalizeEmail(input.email),
      password: input.password,
    });
    const user = await users.upsertFromIdentity({
      subject: verified.subject,
      email: verified.email,
      fullName: verified.fullName,
      now: startedAt,
    });

    const token = generateSessionToken();
    const expiresAt = new Date(startedAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);

    const session = await sessions.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      now: startedAt,
      expiresAt,
    });

    const clinics = await clinicAccess.listAvailableClinics(user.id);

    if (clinics.length === 0) {
      return { token, expiresAt, nextStep: "NO_ACCESS" };
    }

    if (clinics.length > 1) {
      return { token, expiresAt, nextStep: "SELECT_CLINIC" };
    }

    await sessions.setActiveRelationship({
      sessionId: session.id,
      userId: user.id,
      kind: clinics[0].kind,
      relationshipId: clinics[0].relationshipId,
    });

    return { token, expiresAt, nextStep: "HOME" };
  };
}
