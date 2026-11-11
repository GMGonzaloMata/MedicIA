import { describe, expect, it } from "vitest";

import {
  INVITATION_MAX_FAILED_ATTEMPTS,
  INVITATION_TTL_MS,
  effectiveStatus,
  toInvitationSummary,
  type InvitationEntry,
} from "@/modules/users/domain/invitation";

const NOW = new Date("2026-11-11T12:00:00.000Z");

describe("estado efectivo de una invitación", () => {
  it("un pendiente no vencido sigue pendiente", () => {
    expect(effectiveStatus({ status: "PENDING", expiresAt: new Date(NOW.getTime() + 1) }, NOW)).toBe("PENDING");
  });

  it("un pendiente vencido, o que vence justo ahora, se trata como vencido", () => {
    expect(effectiveStatus({ status: "PENDING", expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "PENDING", expiresAt: NOW }, NOW)).toBe("EXPIRED");
  });

  it.each(["ACCEPTED", "REVOKED", "EXPIRED"] as const)("un %s conserva su estado aunque haya vencido", (status) => {
    expect(effectiveStatus({ status, expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(status);
  });
});

describe("constantes de la invitación", () => {
  it("vence a los 7 días y admite 5 intentos incorrectos", () => {
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(INVITATION_MAX_FAILED_ATTEMPTS).toBe(5);
  });
});

describe("resumen de una invitación", () => {
  it("no incluye el token, su hash, el documento ni la matrícula", () => {
    const entry: InvitationEntry = {
      id: "invitation-1",
      tenantId: "clinic-a",
      kind: "PATIENT",
      email: "paciente@example.com",
      tokenHash: "a".repeat(64),
      documentType: "DNI",
      documentNumber: "12345678",
      licenseNumber: null,
      createdByMembershipId: "membership-1",
      createdByUserId: "user-1",
      assignToCreator: true,
      status: "PENDING",
      endReason: null,
      failedAttempts: 0,
      expiresAt: NOW,
      sentAt: null,
      createdAt: NOW,
      revokedAt: null,
      acceptedAt: null,
      acceptedByUserId: null,
      createdByName: "Dra. Pérez",
    };
    const summary = toInvitationSummary(entry);

    expect(summary).toEqual({
      id: "invitation-1",
      kind: "PATIENT",
      email: "paciente@example.com",
      expiresAt: NOW,
      createdAt: NOW,
      sentAt: null,
      createdByName: "Dra. Pérez",
    });
    expect(JSON.stringify(summary)).not.toContain("12345678");
    expect(JSON.stringify(summary)).not.toContain("a".repeat(64));
  });
});
