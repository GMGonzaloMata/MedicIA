import { createHash, randomUUID } from "node:crypto";

import type {
  IdentityProvider,
  VerifiedIdentity,
} from "../../application/ports/out/identity-provider";
import { IdentityError } from "../../domain/identity-errors";
import { meetsPasswordPolicy } from "../../domain/password-policy";

// Código de verificación y de recuperación del proveedor simulado.
export const FAKE_VERIFICATION_CODE = "000000";

// Un despliegue real siempre define las variables de Cognito. Si están presentes, no se arranca el simulado.
const COGNITO_VARIABLES = [
  "COGNITO_REGION",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_CLIENT_SECRET",
] as const;

interface FakeAccount {
  password: string;
  fullName: string;
  isConfirmed: boolean;
}

// Identificador estable por correo, con forma de UUID, para que las pruebas puedan crear la
// cuenta propia de antemano con el mismo `subject`.
export function fakeSubjectForEmail(email: string): string {
  const hash = createHash("sha256").update(email).digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function assertValidPassword(password: string): void {
  if (!meetsPasswordPolicy(password)) {
    throw new IdentityError("INVALID_PASSWORD");
  }
}

// Proveedor de identidad en memoria para desarrollar y probar sin AWS. Cumple el mismo contrato
// que el de Cognito, incluida la respuesta uniforme que no revela si un correo tiene cuenta.
export function createInMemoryIdentityProvider(
  env: Record<string, string | undefined> = process.env,
): IdentityProvider {
  const definedVariables = COGNITO_VARIABLES.filter((name) => env[name] !== undefined);

  if (definedVariables.length > 0) {
    throw new Error(
      "El proveedor de identidad simulado no puede usarse con las variables de Cognito definidas: " +
        "cambiá IDENTITY_PROVIDER a cognito o quitá las variables COGNITO_*.",
    );
  }

  const accounts = new Map<string, FakeAccount>();

  return {
    async signUp({ email, fullName }) {
      // Como en Cognito, la cuenta nace con una contraseña provisional que nadie conoce (R18).
      if (!accounts.has(email)) {
        accounts.set(email, { password: randomUUID(), fullName, isConfirmed: false });
      }
    },

    async confirmSignUp({ email, code, password }) {
      const account = accounts.get(email);

      // Como en Cognito, confirmar una cuenta ya verificada falla y no cambia su contraseña.
      if (!account || account.isConfirmed || code !== FAKE_VERIFICATION_CODE) {
        throw new IdentityError("INVALID_CODE");
      }

      assertValidPassword(password);
      account.password = password;
      account.isConfirmed = true;
    },

    async resendConfirmationCode() {},

    async signIn({ email, password }): Promise<VerifiedIdentity> {
      const account = accounts.get(email);

      if (!account || !account.isConfirmed || account.password !== password) {
        throw new IdentityError("INVALID_CREDENTIALS");
      }

      return { subject: fakeSubjectForEmail(email), email, fullName: account.fullName };
    },

    async requestPasswordReset() {},

    async confirmPasswordReset({ email, code, newPassword }) {
      const account = accounts.get(email);

      if (!account || code !== FAKE_VERIFICATION_CODE) {
        throw new IdentityError("INVALID_CODE");
      }

      assertValidPassword(newPassword);
      account.password = newPassword;
    },
  };
}
