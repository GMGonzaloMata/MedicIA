import { describe, expect, it } from "vitest";

import {
  deriveLinkCodeState,
  formatLinkCode,
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  linkCodeExpiresAt,
  normalizeLinkCode,
} from "@/modules/tenants/domain/patient-link-code";
import { nodeSecretGenerator } from "@/modules/tenants/infrastructure/adapters/node-secret-generator";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("alfabeto del código", () => {
  it("no tiene símbolos que se confundan ni repetidos", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(LINK_CODE_ALPHABET).not.toContain(ambiguous);
    }

    expect(new Set(LINK_CODE_ALPHABET).size).toBe(LINK_CODE_ALPHABET.length);
    expect(LINK_CODE_ALPHABET).toBe(LINK_CODE_ALPHABET.toUpperCase());
  });
});

describe("normalización y formato", () => {
  it("quita guiones y espacios y pasa a mayúsculas", () => {
    expect(normalizeLinkCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(normalizeLinkCode("ABCDE FGHJK")).toBe("ABCDEFGHJK");
  });

  it.each([
    { $name: "largo menor", raw: "ABCDE-FGHJ" },
    { $name: "largo mayor", raw: "ABCDE-FGHJKM" },
    { $name: "símbolo ambiguo", raw: "ABCDE-FGHJ0" },
    { $name: "símbolo fuera del alfabeto", raw: "ABCDE-FGHJ!" },
    { $name: "vacío", raw: "" },
  ])("rechaza $name", ({ raw }) => {
    expect(normalizeLinkCode(raw)).toBeNull();
  });

  it("se muestra como XXXXX-XXXXX y vuelve a normalizarse igual", () => {
    const code = normalizeLinkCode("abcdefghjk");

    expect(code && formatLinkCode(code)).toBe("ABCDE-FGHJK");
    expect(normalizeLinkCode("ABCDE-FGHJK")).toBe(code);
  });
});

describe("generación", () => {
  it("produce códigos válidos, distintos y solo con símbolos del alfabeto", () => {
    const codes = Array.from({ length: 200 }, () => nodeSecretGenerator.generateLinkCode());

    for (const code of codes) {
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      expect(normalizeLinkCode(code)).toBe(code);
    }

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("vencimiento y estado", () => {
  it("vence a los 7 días", () => {
    expect(linkCodeExpiresAt(NOW).getTime() - NOW.getTime()).toBe(7 * DAY_MS);
  });

  it.each([
    { $name: "activo y vigente", status: "ACTIVE", offset: DAY_MS, expected: "active" },
    { $name: "activo y vencido", status: "ACTIVE", offset: -DAY_MS, expected: "expired" },
    { $name: "activo justo al vencer", status: "ACTIVE", offset: 0, expected: "expired" },
    { $name: "usado", status: "USED", offset: DAY_MS, expected: "used" },
    { $name: "reemplazado", status: "REPLACED", offset: DAY_MS, expected: "replaced" },
    { $name: "bloqueado", status: "LOCKED", offset: DAY_MS, expected: "locked" },
    { $name: "usado aunque haya vencido", status: "USED", offset: -DAY_MS, expected: "used" },
  ] as const)("$name es $expected", ({ status, offset, expected }) => {
    expect(deriveLinkCodeState({ status, expiresAt: new Date(NOW.getTime() + offset) }, NOW)).toBe(expected);
  });
});
