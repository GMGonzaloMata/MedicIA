import "server-only";

import { createCognitoIdentityProvider } from "@/infrastructure/aws/cognito/cognito-identity-provider";

import type { IdentityProvider } from "../../application/ports/out/identity-provider";
import { createInMemoryIdentityProvider } from "./in-memory-identity-provider";

// Elige el proveedor según IDENTITY_PROVIDER. No hay valor por defecto: si falta o es desconocido
// la aplicación no arranca, para que un entorno mal configurado no use el simulado por error.
export function createIdentityProvider(env: Record<string, string | undefined>): IdentityProvider {
  switch (env.IDENTITY_PROVIDER) {
    case "cognito":
      return createCognitoIdentityProvider(env);
    case "fake":
      return createInMemoryIdentityProvider(env);
    default:
      throw new Error('IDENTITY_PROVIDER debe ser "cognito" o "fake".');
  }
}
