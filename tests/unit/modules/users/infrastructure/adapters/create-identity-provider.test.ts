import { describe, expect, it } from "vitest";

import { createIdentityProvider } from "@/modules/users/infrastructure/adapters/create-identity-provider";

const COGNITO_ENV = {
  IDENTITY_PROVIDER: "cognito",
  COGNITO_REGION: "us-east-1",
  COGNITO_USER_POOL_ID: "us-east-1_ejemplo",
  COGNITO_CLIENT_ID: "cliente-de-prueba",
  COGNITO_CLIENT_SECRET: "secreto-de-prueba",
};

describe("createIdentityProvider", () => {
  it("no inicia sin IDENTITY_PROVIDER ni con un valor desconocido", () => {
    expect(() => createIdentityProvider({})).toThrow("IDENTITY_PROVIDER");
    expect(() => createIdentityProvider({ IDENTITY_PROVIDER: "otro" })).toThrow("IDENTITY_PROVIDER");
  });

  it("devuelve el proveedor simulado con fake", () => {
    expect(createIdentityProvider({ IDENTITY_PROVIDER: "fake" }).signIn).toBeTypeOf("function");
  });

  it("devuelve el proveedor de Cognito con las variables completas", () => {
    expect(createIdentityProvider(COGNITO_ENV).signIn).toBeTypeOf("function");
  });

  it("falla con una variable de Cognito faltante sin incluir el secreto", () => {
    let message = "";
    try {
      createIdentityProvider({ ...COGNITO_ENV, COGNITO_CLIENT_ID: undefined });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("COGNITO_CLIENT_ID");
    expect(message).not.toContain("secreto-de-prueba");
  });

  it("no permite el simulado junto con las variables de Cognito", () => {
    expect(() => createIdentityProvider({ ...COGNITO_ENV, IDENTITY_PROVIDER: "fake" })).toThrow(
      "variables de Cognito",
    );
  });
});
