import { describe, expect, it } from "vitest";

import { AccountConflictError, IdentityError } from "@/modules/users/domain/identity-errors";

describe("IdentityError", () => {
  it("conserva solo el código cerrado y no un mensaje del proveedor", () => {
    const error = new IdentityError("INVALID_CREDENTIALS");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IdentityError");
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.message).toBe("INVALID_CREDENTIALS");
  });
});

describe("AccountConflictError", () => {
  it("se identifica por su nombre y no incluye datos de la cuenta", () => {
    const error = new AccountConflictError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AccountConflictError");
    expect(error.message).toBe("ACCOUNT_CONFLICT");
  });
});
