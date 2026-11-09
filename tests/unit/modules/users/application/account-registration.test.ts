import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityProvider } from "@/modules/users/application/ports/out/identity-provider";
import { createConfirmAccount } from "@/modules/users/application/use-cases/confirm-account";
import { createRegisterAccount } from "@/modules/users/application/use-cases/register-account";
import { createResendConfirmationCode } from "@/modules/users/application/use-cases/resend-confirmation-code";
import { IdentityError } from "@/modules/users/domain/identity-errors";

function stubIdentity() {
  return {
    signUp: vi.fn(async () => {}),
    confirmSignUp: vi.fn(async () => {}),
    resendConfirmationCode: vi.fn(async () => {}),
    signIn: vi.fn(),
    requestPasswordReset: vi.fn(async () => {}),
    confirmPasswordReset: vi.fn(async () => {}),
  } satisfies IdentityProvider;
}

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  consoleSpies = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

function expectNothingLogged() {
  consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
}

describe("registerAccount", () => {
  it("normaliza el correo y el nombre antes de llamar al proveedor", async () => {
    const identity = stubIdentity();

    await createRegisterAccount({ identity })({
      email: "  Persona@Example.COM ",
      fullName: "  Persona Uno ",
    });

    expect(identity.signUp).toHaveBeenCalledWith({
      email: "persona@example.com",
      fullName: "Persona Uno",
    });
    expectNothingLogged();
  });

  it("devuelve el mismo resultado sin importar si la cuenta ya existía", async () => {
    const identity = stubIdentity();
    const registerAccount = createRegisterAccount({ identity });
    const input = { email: "a@example.com", fullName: "Persona" };

    await expect(registerAccount(input)).resolves.toBeUndefined();
    await expect(registerAccount(input)).resolves.toBeUndefined();
  });

  it("propaga el error cerrado del proveedor", async () => {
    const identity = stubIdentity();
    identity.signUp.mockRejectedValue(new IdentityError("UNAVAILABLE"));

    await expect(
      createRegisterAccount({ identity })({ email: "a@example.com", fullName: "Persona" }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expectNothingLogged();
  });
});

describe("confirmAccount", () => {
  it("normaliza el correo y recorta el código", async () => {
    const identity = stubIdentity();

    await createConfirmAccount({ identity })({
      email: " A@Example.com ",
      code: " 123456 ",
      password: "contraseña larga 123",
    });

    // La contraseña no se recorta ni se modifica.
    expect(identity.confirmSignUp).toHaveBeenCalledWith({
      email: "a@example.com",
      code: "123456",
      password: "contraseña larga 123",
    });
    expectNothingLogged();
  });

  it("propaga el código inválido", async () => {
    const identity = stubIdentity();
    identity.confirmSignUp.mockRejectedValue(new IdentityError("INVALID_CODE"));

    await expect(
      createConfirmAccount({ identity })({ email: "a@example.com", code: "123456", password: "contraseña-larga-123" }),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
  });
});

describe("resendConfirmationCode", () => {
  it("normaliza el correo y responde igual exista o no la cuenta", async () => {
    const identity = stubIdentity();

    await expect(createResendConfirmationCode({ identity })({ email: " A@Example.com " })).resolves.toBeUndefined();

    expect(identity.resendConfirmationCode).toHaveBeenCalledWith({ email: "a@example.com" });
    expectNothingLogged();
  });
});
