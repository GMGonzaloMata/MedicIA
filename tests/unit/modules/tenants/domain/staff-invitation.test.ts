import { describe, expect, it } from "vitest";

import { normalizeEmail } from "@/modules/tenants/domain/normalized-values";
import {
  decideAcceptance,
  deriveInvitationState,
  INVITATION_VALIDITY_DAYS,
  invitationExpiresAt,
  type AcceptanceInput,
} from "@/modules/tenants/domain/staff-invitation";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const EMAIL = normalizeEmail("ana@clinica.com")!;
const OTHER_EMAIL = normalizeEmail("luis@clinica.com")!;
const DOCTOR = { isClinicAdmin: false, isDoctor: true };
const ADMIN = { isClinicAdmin: true, isDoctor: false };
const BOTH = { isClinicAdmin: true, isDoctor: true };
const PROFILE = { specialty: "Cardiología", licenseNumber: "MP-123" };
const tomorrow = new Date(NOW.getTime() + DAY);

describe("vencimiento de una invitación", () => {
  it("vence a los 7 días", () => {
    expect(INVITATION_VALIDITY_DAYS).toBe(7);
    expect(invitationExpiresAt(NOW).getTime() - NOW.getTime()).toBe(7 * DAY);
  });
});

describe("estado derivado de una invitación", () => {
  const past = new Date(NOW.getTime() - DAY);

  it("una pendiente con tiempo es pendiente", () => {
    expect(deriveInvitationState({ status: "PENDING", expiresAt: tomorrow }, NOW)).toBe("pending");
  });

  it("una pendiente cuya fecha pasó es vencida, sin que nadie la actualice", () => {
    expect(deriveInvitationState({ status: "PENDING", expiresAt: past }, NOW)).toBe("expired");
  });

  it("vence justo en el instante de su fecha", () => {
    expect(deriveInvitationState({ status: "PENDING", expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("aceptada y revocada no dependen de la fecha", () => {
    expect(deriveInvitationState({ status: "ACCEPTED", expiresAt: past }, NOW)).toBe("accepted");
    expect(deriveInvitationState({ status: "REVOKED", expiresAt: tomorrow }, NOW)).toBe("revoked");
  });
});

describe("decisión de aceptar una invitación", () => {
  function input(overrides: Partial<AcceptanceInput> = {}): AcceptanceInput {
    return {
      invitation: { status: "PENDING", expiresAt: tomorrow, email: EMAIL, roles: DOCTOR, doctor: PROFILE },
      tenantStatus: "ACTIVE",
      membership: null,
      userEmail: EMAIL,
      now: NOW,
      ...overrides,
    };
  }

  it("crea la membresía con los roles y los datos de médico de la invitación", () => {
    expect(decideAcceptance(input())).toEqual({ kind: "create", roles: DOCTOR, doctor: PROFILE });
  });

  it("una invitación de administrador crea la membresía sin datos de médico", () => {
    expect(
      decideAcceptance(input({ invitation: { status: "PENDING", expiresAt: tomorrow, email: EMAIL, roles: ADMIN, doctor: null } })),
    ).toEqual({ kind: "create", roles: ADMIN, doctor: null });
  });

  it("suma el rol de médico a un administrador existente y le carga sus datos, sin duplicar la membresía", () => {
    expect(
      decideAcceptance(input({ membership: { membershipId: "m-1", roles: ADMIN, status: "ACTIVE" } })),
    ).toEqual({ kind: "merge", membershipId: "m-1", roles: BOTH, doctor: PROFILE });
  });

  it("quien ya es médico conserva su especialidad y su matrícula: la invitación no los pisa", () => {
    expect(
      decideAcceptance(
        input({
          invitation: { status: "PENDING", expiresAt: tomorrow, email: EMAIL, roles: BOTH, doctor: PROFILE },
          membership: { membershipId: "m-1", roles: DOCTOR, status: "ACTIVE" },
        }),
      ),
    ).toEqual({ kind: "merge", membershipId: "m-1", roles: BOTH, doctor: null });
  });

  it("sumar solo el rol de administrador a un médico no toca sus datos", () => {
    expect(
      decideAcceptance(
        input({
          invitation: { status: "PENDING", expiresAt: tomorrow, email: EMAIL, roles: ADMIN, doctor: null },
          membership: { membershipId: "m-1", roles: DOCTOR, status: "ACTIVE" },
        }),
      ),
    ).toEqual({ kind: "merge", membershipId: "m-1", roles: BOTH, doctor: null });
  });

  it.each([
    {
      name: "una invitación vencida",
      overrides: { invitation: { status: "PENDING" as const, expiresAt: NOW, email: EMAIL, roles: DOCTOR, doctor: PROFILE } },
    },
    {
      name: "una invitación ya usada",
      overrides: { invitation: { status: "ACCEPTED" as const, expiresAt: tomorrow, email: EMAIL, roles: DOCTOR, doctor: PROFILE } },
    },
    {
      name: "una invitación revocada",
      overrides: { invitation: { status: "REVOKED" as const, expiresAt: tomorrow, email: EMAIL, roles: DOCTOR, doctor: PROFILE } },
    },
    { name: "otro correo", overrides: { userEmail: OTHER_EMAIL } },
    { name: "una clínica suspendida", overrides: { tenantStatus: "SUSPENDED" as const } },
    {
      name: "un miembro desactivado",
      overrides: { membership: { membershipId: "m-1", roles: DOCTOR, status: "DEACTIVATED" as const } },
    },
  ])("rechaza $name, siempre con el mismo resultado", ({ overrides }) => {
    expect(decideAcceptance(input(overrides))).toEqual({ kind: "reject" });
  });
});
