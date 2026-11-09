import {
  AdminSetUserPasswordCommand,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCognitoIdentityProvider,
  type IdTokenVerifier,
} from "@/infrastructure/aws/cognito/cognito-identity-provider";
import { computeSecretHash } from "@/infrastructure/aws/cognito/secret-hash";
import { IdentityError } from "@/modules/users/domain/identity-errors";

const CONFIG = {
  region: "us-east-1",
  userPoolId: "us-east-1_ejemplo",
  clientId: "cliente-de-prueba",
  clientSecret: "secreto-de-prueba",
};
const EMAIL = "persona@example.com";
const PASSWORD = "contraseña-secreta-123";
const CODE = "654321";
const ID_TOKEN = "token-de-identidad-de-prueba";

const VALID_CLAIMS = {
  sub: "sub-123",
  email: "Persona@Example.com",
  email_verified: true,
  name: "Persona Uno",
};

function awsError(name: string): Error {
  const error = new Error(`mensaje interno de AWS con ${EMAIL}`);
  error.name = name;

  return error;
}

function setup(verifyResult: unknown = VALID_CLAIMS) {
  const send = vi.fn();
  const verifier: IdTokenVerifier = {
    verify: vi.fn(async () => verifyResult),
  };
  // El adaptador solo usa `send` del cliente; se simula únicamente ese método.
  const client = { send } as unknown as Parameters<typeof buildCognitoIdentityProvider>[1]["client"];

  return { send, verifier, provider: buildCognitoIdentityProvider(CONFIG, { client, verifier }) };
}

async function codeOf(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
  } catch (error) {
    return error instanceof IdentityError ? error.code : "OTRO_ERROR";
  }

  return undefined;
}

const EXPECTED_HASH = computeSecretHash({ username: EMAIL, clientId: CONFIG.clientId, clientSecret: CONFIG.clientSecret });

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("registro", () => {
  it("envía el correo, el nombre y el SECRET_HASH", async () => {
    const { provider, send } = setup();
    send.mockResolvedValue({});

    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(SignUpCommand);
    expect(command.input).toMatchObject({
      ClientId: CONFIG.clientId,
      Username: EMAIL,
      SecretHash: EXPECTED_HASH,
      UserAttributes: [
        { Name: "email", Value: EMAIL },
        { Name: "name", Value: "Persona Uno" },
      ],
    });
  });

  it("usa una contraseña provisional aleatoria que no es la de ninguna persona (R18)", async () => {
    const { provider, send } = setup();
    send.mockResolvedValue({});

    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });

    const first = send.mock.calls[0][0].input.Password;
    const second = send.mock.calls[1][0].input.Password;
    expect(first).toHaveLength(44);
    expect(first).toMatch(/[A-Z]/);
    expect(first).not.toBe(second);
  });

  it("reenvía el código y responde igual cuando el correo ya existe", async () => {
    const { provider, send } = setup();
    send.mockRejectedValueOnce(awsError("UsernameExistsException")).mockResolvedValueOnce({});

    await expect(provider.signUp({ email: EMAIL, fullName: "P" })).resolves.toBeUndefined();

    expect(send.mock.calls[1][0]).toBeInstanceOf(ResendConfirmationCodeCommand);
  });

  it("absorbe el error del reenvío cuando la cuenta ya estaba verificada", async () => {
    const { provider, send } = setup();
    send
      .mockRejectedValueOnce(awsError("UsernameExistsException"))
      .mockRejectedValueOnce(awsError("InvalidParameterException"));

    await expect(provider.signUp({ email: EMAIL, fullName: "P" })).resolves.toBeUndefined();
  });

  it("falla como no disponible si el reenvío tras un correo existente falla por otra causa", async () => {
    const { provider, send } = setup();
    send.mockRejectedValueOnce(awsError("UsernameExistsException")).mockRejectedValueOnce(awsError("InternalErrorException"));

    expect(await codeOf(provider.signUp({ email: EMAIL, fullName: "P" }))).toBe("UNAVAILABLE");
  });

  it("mapea cualquier otro error a no disponible", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("InternalErrorException"));

    expect(await codeOf(provider.signUp({ email: EMAIL, fullName: "P" }))).toBe("UNAVAILABLE");
  });
});

describe("verificación y reenvío del código", () => {
  it("confirma la cuenta con el código y el SECRET_HASH", async () => {
    const { provider, send } = setup();
    send.mockResolvedValue({});

    await provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(ConfirmSignUpCommand);
    expect(command.input).toMatchObject({ Username: EMAIL, ConfirmationCode: CODE, SecretHash: EXPECTED_HASH });
  });

  it("fija la contraseña elegida solo después de verificar el correo (R18)", async () => {
    const { provider, send } = setup();
    send.mockResolvedValue({});

    await provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD });

    expect(send.mock.calls[0][0]).toBeInstanceOf(ConfirmSignUpCommand);
    const command = send.mock.calls[1][0];
    expect(command).toBeInstanceOf(AdminSetUserPasswordCommand);
    expect(command.input).toEqual({
      UserPoolId: CONFIG.userPoolId,
      Username: EMAIL,
      Password: PASSWORD,
      Permanent: true,
    });
  });

  it("con un código incorrecto no fija ninguna contraseña", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("CodeMismatchException"));

    expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }))).toBe(
      "INVALID_CODE",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(["InvalidPasswordException", "InvalidParameterException"])(
    "mapea %s al fijar la contraseña a contraseña inválida",
    async (name) => {
      const { provider, send } = setup();
      send.mockResolvedValueOnce({}).mockRejectedValueOnce(awsError(name));

      expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }))).toBe(
        "INVALID_PASSWORD",
      );
    },
  );

  it("si la contraseña es rechazada, deja la cuenta con una aleatoria desconocida y lo registra sin datos", async () => {
    const { provider, send } = setup();
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(awsError("InvalidParameterException"))
      .mockResolvedValueOnce({});

    expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }))).toBe(
      "INVALID_PASSWORD",
    );

    const reset = send.mock.calls[2][0];
    expect(reset).toBeInstanceOf(AdminSetUserPasswordCommand);
    expect(reset.input.Password).not.toBe(PASSWORD);
    expect(reset.input.Password).toHaveLength(44);
    expect(consoleError.mock.calls.flat().join("\n")).toContain("confirmSignUp.setPassword");
  });

  it("mapea otro error al fijar la contraseña a no disponible", async () => {
    const { provider, send } = setup();
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(awsError("InternalErrorException"));

    expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }))).toBe(
      "UNAVAILABLE",
    );
  });

  it.each(["CodeMismatchException", "ExpiredCodeException", "UserNotFoundException", "NotAuthorizedException"])(
    "mapea %s a código inválido",
    async (name) => {
      const { provider, send } = setup();
      send.mockRejectedValue(awsError(name));

      expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }))).toBe("INVALID_CODE");
    },
  );

  it("mapea otro error al confirmar a no disponible", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("InternalErrorException"));

    expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }))).toBe("UNAVAILABLE");
  });

  it("reenvía el código y responde igual si la cuenta no existe o ya está verificada", async () => {
    const { provider, send } = setup();
    send.mockResolvedValueOnce({});
    await provider.resendConfirmationCode({ email: EMAIL });
    expect(send.mock.calls[0][0]).toBeInstanceOf(ResendConfirmationCodeCommand);

    for (const name of ["UserNotFoundException", "InvalidParameterException", "NotAuthorizedException", "LimitExceededException"]) {
      send.mockRejectedValueOnce(awsError(name));
      await expect(provider.resendConfirmationCode({ email: EMAIL })).resolves.toBeUndefined();
    }
  });

  it("mapea una falla del servicio al reenviar a no disponible", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("TooManyRequestsException"));

    expect(await codeOf(provider.resendConfirmationCode({ email: EMAIL }))).toBe("UNAVAILABLE");
  });
});

describe("ingreso", () => {
  it("valida el token de identidad y devuelve solo la identidad, con el correo en minúsculas", async () => {
    const { provider, send, verifier } = setup();
    send.mockResolvedValue({ AuthenticationResult: { IdToken: ID_TOKEN, AccessToken: "acceso", RefreshToken: "refresco" } });

    const identity = await provider.signIn({ email: EMAIL, password: PASSWORD });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(InitiateAuthCommand);
    expect(command.input).toMatchObject({
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: EMAIL, PASSWORD, SECRET_HASH: EXPECTED_HASH },
    });
    expect(verifier.verify).toHaveBeenCalledWith(ID_TOKEN);
    expect(identity).toEqual({ subject: "sub-123", email: "persona@example.com", fullName: "Persona Uno" });
    expect(JSON.stringify(identity)).not.toContain(ID_TOKEN);
  });

  it.each([
    "NotAuthorizedException",
    "UserNotFoundException",
    "UserNotConfirmedException",
    "PasswordResetRequiredException",
  ])("mapea %s a credenciales inválidas", async (name) => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError(name));

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
  });

  it("mapea una falla del servicio a no disponible", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("InternalErrorException"));

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("UNAVAILABLE");
  });

  it("trata un desafío sin token como credenciales inválidas", async () => {
    const { provider, send } = setup();
    send.mockResolvedValue({ ChallengeName: "NEW_PASSWORD_REQUIRED" });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
  });

  it("rechaza un token que no valida", async () => {
    const { provider, send, verifier } = setup();
    send.mockResolvedValue({ AuthenticationResult: { IdToken: ID_TOKEN } });
    vi.mocked(verifier.verify).mockRejectedValue(new Error("firma inválida"));

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
  });

  it.each([
    { description: "sin el correo verificado", claims: { ...VALID_CLAIMS, email_verified: false } },
    { description: "sin identificador", claims: { ...VALID_CLAIMS, sub: "" } },
    { description: "sin nombre", claims: { ...VALID_CLAIMS, name: undefined } },
    { description: "que no es un objeto", claims: "texto" },
  ])("rechaza un token $description", async ({ claims }) => {
    const { provider, send } = setup(claims);
    send.mockResolvedValue({ AuthenticationResult: { IdToken: ID_TOKEN } });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
  });

  it('acepta el correo verificado informado como el texto "true"', async () => {
    const { provider, send } = setup({ ...VALID_CLAIMS, email_verified: "true" });
    send.mockResolvedValue({ AuthenticationResult: { IdToken: ID_TOKEN } });

    expect((await provider.signIn({ email: EMAIL, password: PASSWORD })).subject).toBe("sub-123");
  });
});

describe("recuperación de contraseña", () => {
  it("pide el código y responde igual si la cuenta no existe", async () => {
    const { provider, send } = setup();
    send.mockResolvedValueOnce({});
    await provider.requestPasswordReset({ email: EMAIL });
    expect(send.mock.calls[0][0]).toBeInstanceOf(ForgotPasswordCommand);

    for (const name of ["UserNotFoundException", "InvalidParameterException", "NotAuthorizedException", "LimitExceededException"]) {
      send.mockRejectedValueOnce(awsError(name));
      await expect(provider.requestPasswordReset({ email: EMAIL })).resolves.toBeUndefined();
    }
  });

  it("mapea una falla del servicio al pedir el código a no disponible", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("InternalErrorException"));

    expect(await codeOf(provider.requestPasswordReset({ email: EMAIL }))).toBe("UNAVAILABLE");
  });

  it("cambia la contraseña con el código", async () => {
    const { provider, send } = setup();
    send.mockResolvedValue({});

    await provider.confirmPasswordReset({ email: EMAIL, code: CODE, newPassword: PASSWORD });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(ConfirmForgotPasswordCommand);
    expect(command.input).toMatchObject({ Username: EMAIL, ConfirmationCode: CODE, Password: PASSWORD, SecretHash: EXPECTED_HASH });
  });

  it.each([
    { name: "CodeMismatchException", expected: "INVALID_CODE" },
    { name: "ExpiredCodeException", expected: "INVALID_CODE" },
    { name: "UserNotFoundException", expected: "INVALID_CODE" },
    { name: "InvalidPasswordException", expected: "INVALID_PASSWORD" },
    { name: "InvalidParameterException", expected: "INVALID_PASSWORD" },
    { name: "InternalErrorException", expected: "UNAVAILABLE" },
  ])("mapea $name a $expected", async ({ name, expected }) => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError(name));

    expect(await codeOf(provider.confirmPasswordReset({ email: EMAIL, code: CODE, newPassword: PASSWORD }))).toBe(
      expected,
    );
  });
});

describe("registros de actividad (FR-028)", () => {
  it("no incluyen contraseña, código, token, correo ni el mensaje de AWS", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue(awsError("InternalErrorException"));

    await codeOf(provider.signUp({ email: EMAIL, fullName: "Persona Uno" }));
    await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }));
    await codeOf(provider.confirmSignUp({ email: EMAIL, code: CODE, password: PASSWORD }));
    await codeOf(provider.confirmPasswordReset({ email: EMAIL, code: CODE, newPassword: PASSWORD }));

    expect(consoleError).toHaveBeenCalled();

    const logged = consoleError.mock.calls.flat().join("\n");
    for (const sensitive of [PASSWORD, CODE, ID_TOKEN, EMAIL, "Persona Uno", CONFIG.clientSecret, "mensaje interno"]) {
      expect(logged).not.toContain(sensitive);
    }
    expect(logged).toContain("InternalErrorException");
  });

  it("registra el nombre del error aunque no sea una instancia de Error", async () => {
    const { provider, send } = setup();
    send.mockRejectedValue("texto");

    await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }));

    expect(consoleError.mock.calls.flat().join("\n")).toContain("UnknownError");
  });
});
