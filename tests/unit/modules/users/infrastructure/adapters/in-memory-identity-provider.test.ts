import { describe, expect, it } from "vitest";

import { IdentityError } from "@/modules/users/domain/identity-errors";
import {
  FAKE_VERIFICATION_CODE,
  createInMemoryIdentityProvider,
  fakeSubjectForEmail,
} from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

const EMAIL = "persona@example.com";
const PASSWORD = "Contraseña-larga-123";

async function codeOf(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
  } catch (error) {
    return error instanceof IdentityError ? error.code : "OTRO_ERROR";
  }

  return undefined;
}

function newProvider() {
  return createInMemoryIdentityProvider({});
}

describe("createInMemoryIdentityProvider", () => {
  it("registra, verifica con el código fijo e ingresa", async () => {
    const provider = newProvider();

    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    expect(await provider.signIn({ email: EMAIL, password: PASSWORD })).toEqual({
      subject: fakeSubjectForEmail(EMAIL),
      email: EMAIL,
      fullName: "Persona Uno",
    });
  });

  it("rechaza al verificar una contraseña que no cumple la política y no verifica la cuenta", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, fullName: "P" });
    const confirmWith = (password: string) =>
      provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password });

    const withLength = (length: number) => `A${"a".repeat(length - 1)}`;

    expect(await codeOf(confirmWith(withLength(7)))).toBe("INVALID_PASSWORD");
    expect(await codeOf(confirmWith(withLength(129)))).toBe("INVALID_PASSWORD");
    expect(await codeOf(confirmWith("a".repeat(20)))).toBe("INVALID_PASSWORD");
    expect(await codeOf(provider.signIn({ email: EMAIL, password: withLength(8) }))).toBe("INVALID_CREDENTIALS");
    expect(await codeOf(confirmWith(withLength(8)))).toBeUndefined();
  });

  it("responde igual al registrar un correo que ya existe y no pisa la cuenta", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    await expect(provider.signUp({ email: EMAIL, fullName: "Intruso" })).resolves.toBeUndefined();

    expect((await provider.signIn({ email: EMAIL, password: PASSWORD })).fullName).toBe("Persona Uno");
  });

  it("confirmar una cuenta ya verificada falla y no cambia su contraseña", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    const again = provider.confirmSignUp({
      email: EMAIL,
      code: FAKE_VERIFICATION_CODE,
      password: "Contraseña-intrusa-1",
    });

    expect(await codeOf(again)).toBe("INVALID_CODE");
    expect((await provider.signIn({ email: EMAIL, password: PASSWORD })).email).toBe(EMAIL);
  });

  it("quien inicia un registro con el correo de otra persona no puede ingresar ni conocer la contraseña (R18)", async () => {
    const provider = newProvider();

    // El intruso inicia el registro con el correo de la dueña. Como el registro no recibe
    // contraseña, no hay ninguna que él pueda elegir.
    await provider.signUp({ email: EMAIL, fullName: "Intruso" });
    // La dueña se registra (la cuenta pendiente se reutiliza) y verifica con su contraseña.
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: "Contraseña-del-intruso-1" }))).toBe(
      "INVALID_CREDENTIALS",
    );
    expect((await provider.signIn({ email: EMAIL, password: PASSWORD })).email).toBe(EMAIL);
  });

  it("rechaza el ingreso sin verificar, con contraseña incorrecta o con un correo inexistente", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");

    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: "equivocada-123456" }))).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(await codeOf(provider.signIn({ email: "nadie@example.com", password: PASSWORD }))).toBe(
      "INVALID_CREDENTIALS",
    );
  });

  it("rechaza un código de verificación incorrecto o de un correo inexistente", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });

    expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: "123456", password: PASSWORD }))).toBe("INVALID_CODE");
    expect(await codeOf(provider.confirmSignUp({ email: "nadie@example.com", code: FAKE_VERIFICATION_CODE, password: PASSWORD }))).toBe(
      "INVALID_CODE",
    );
  });

  it("responde igual al reenviar el código o pedir la recuperación exista o no la cuenta", async () => {
    const provider = newProvider();

    await expect(provider.resendConfirmationCode({ email: "nadie@example.com" })).resolves.toBeUndefined();
    await expect(provider.requestPasswordReset({ email: "nadie@example.com" })).resolves.toBeUndefined();
  });

  it("cambia la contraseña con el código y la anterior deja de servir", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    expect(
      await codeOf(provider.confirmPasswordReset({ email: EMAIL, code: "123456", newPassword: "Nueva-contraseña-1" })),
    ).toBe("INVALID_CODE");
    expect(
      await codeOf(
        provider.confirmPasswordReset({ email: EMAIL, code: FAKE_VERIFICATION_CODE, newPassword: "corta" }),
      ),
    ).toBe("INVALID_PASSWORD");

    await provider.confirmPasswordReset({
      email: EMAIL,
      code: FAKE_VERIFICATION_CODE,
      newPassword: "Nueva-contraseña-1",
    });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
    expect(await codeOf(provider.signIn({ email: EMAIL, password: "Nueva-contraseña-1" }))).toBeUndefined();
  });

  it("rechaza la recuperación de un correo inexistente como código incorrecto", async () => {
    const provider = newProvider();

    expect(
      await codeOf(
        provider.confirmPasswordReset({
          email: "nadie@example.com",
          code: FAKE_VERIFICATION_CODE,
          newPassword: "Nueva-contraseña-1",
        }),
      ),
    ).toBe("INVALID_CODE");
  });

  it("no inicia si hay variables de Cognito definidas", () => {
    expect(() => createInMemoryIdentityProvider({ COGNITO_CLIENT_SECRET: "secreto-de-prueba" })).toThrow(
      "variables de Cognito",
    );
    expect(() => createInMemoryIdentityProvider({ COGNITO_REGION: "" })).toThrow("variables de Cognito");
    expect(() => createInMemoryIdentityProvider({ OTRA_VARIABLE: "x" })).not.toThrow();
  });

  it("no incluye el valor de las variables en el error de arranque", () => {
    expect(() => createInMemoryIdentityProvider({ COGNITO_CLIENT_SECRET: "secreto-de-prueba" })).not.toThrow(
      /secreto-de-prueba/,
    );
  });
});

describe("fakeSubjectForEmail", () => {
  it("es estable por correo, distinto entre correos y con forma de UUID", () => {
    expect(fakeSubjectForEmail(EMAIL)).toBe(fakeSubjectForEmail(EMAIL));
    expect(fakeSubjectForEmail(EMAIL)).not.toBe(fakeSubjectForEmail("otra@example.com"));
    expect(fakeSubjectForEmail(EMAIL)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
