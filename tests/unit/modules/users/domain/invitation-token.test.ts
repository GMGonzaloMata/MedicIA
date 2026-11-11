import { describe, expect, it } from "vitest";

import {
  generateInvitationToken,
  hashInvitationToken,
  isWellFormedInvitationToken,
} from "@/modules/users/domain/invitation-token";

describe("token de invitación", () => {
  it("genera tokens de 43 caracteres en base64url", () => {
    const token = generateInvitationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedInvitationToken(token)).toBe(true);
  });

  it("dos tokens generados son distintos", () => {
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });

  it("el hash es estable, de 64 caracteres hexadecimales y distinto del token", () => {
    const token = generateInvitationToken();

    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(token)).not.toContain(token);
  });

  it("tokens distintos dan hashes distintos", () => {
    expect(hashInvitationToken("a".repeat(43))).not.toBe(hashInvitationToken("b".repeat(43)));
  });

  it.each([
    ["una cadena vacía", ""],
    ["una demasiado corta", "abc"],
    ["una demasiado larga", "a".repeat(44)],
    ["una con caracteres fuera de base64url", `${"a".repeat(42)}+`],
    ["un número", 123],
    ["un valor nulo", null],
    ["un valor indefinido", undefined],
  ])("rechaza %s", (description, value) => {
    expect(isWellFormedInvitationToken(value)).toBe(false);
  });
});
