import { describe, expect, it } from "vitest";

import { loadCognitoConfig } from "@/infrastructure/aws/cognito/config";
import { computeSecretHash } from "@/infrastructure/aws/cognito/secret-hash";

const VALID_ENV = {
  COGNITO_REGION: "us-east-1",
  COGNITO_USER_POOL_ID: "us-east-1_ejemplo",
  COGNITO_CLIENT_ID: "cliente-de-prueba",
  COGNITO_CLIENT_SECRET: "secreto-de-prueba",
};

describe("loadCognitoConfig", () => {
  it("devuelve la configuración con las cuatro variables", () => {
    expect(loadCognitoConfig(VALID_ENV)).toEqual({
      region: "us-east-1",
      userPoolId: "us-east-1_ejemplo",
      clientId: "cliente-de-prueba",
      clientSecret: "secreto-de-prueba",
    });
  });

  it("nombra las variables faltantes o vacías sin mostrar sus valores", () => {
    let message = "";
    try {
      loadCognitoConfig({ ...VALID_ENV, COGNITO_REGION: "", COGNITO_CLIENT_ID: undefined });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("COGNITO_REGION");
    expect(message).toContain("COGNITO_CLIENT_ID");
    expect(message).not.toContain("secreto-de-prueba");
    expect(message).not.toContain("us-east-1_ejemplo");
  });
});

describe("computeSecretHash", () => {
  it("coincide con el HMAC-SHA256 en base 64 de referencia", () => {
    expect(
      computeSecretHash({ username: "usuario", clientId: "cliente", clientSecret: "secreto" }),
    ).toBe("r5Yca8LOgls+DW/3Lb1H9S0XCLTtIdAaFKfgooBfexs=");
  });

  it("cambia si cambia el usuario", () => {
    const base = { clientId: "cliente", clientSecret: "secreto" };

    expect(computeSecretHash({ ...base, username: "a" })).not.toBe(computeSecretHash({ ...base, username: "b" }));
  });
});
