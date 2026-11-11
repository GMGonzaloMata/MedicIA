import { describe, expect, it } from "vitest";

import {
  InvitationConflictError,
  InvitationForbiddenError,
  InvitationInputError,
  InvitationNotFoundError,
  MailDeliveryError,
  isInvitationForbiddenError,
  isInvitationInputError,
  isInvitationNotFoundError,
  type MailDeliveryErrorCode,
} from "@/modules/users/domain/invitation-errors";

describe("errores de invitaciones", () => {
  it("el error de entrega tiene un mensaje fijo por código, sin datos del envío", () => {
    const codes: MailDeliveryErrorCode[] = ["UNAVAILABLE", "REJECTED", "NOT_CONFIGURED"];

    for (const code of codes) {
      const error = new MailDeliveryError(code);

      expect(error.code).toBe(code);
      expect(error.name).toBe("MailDeliveryError");
      expect(error.message).not.toContain("@");
      expect(error.message).not.toContain("http");
    }
  });

  it("el conflicto lleva el motivo y un mensaje genérico", () => {
    const error = new InvitationConflictError("DOCUMENT_IN_USE");

    expect(error.reason).toBe("DOCUMENT_IN_USE");
    expect(error.message).not.toContain("DOCUMENT_IN_USE");
  });

  it("se reconocen por su nombre, aunque vengan de otra copia del módulo", () => {
    const foreign = (name: string) => Object.assign(new Error("x"), { name });

    expect(isInvitationForbiddenError(new InvitationForbiddenError())).toBe(true);
    expect(isInvitationForbiddenError(foreign("InvitationForbiddenError"))).toBe(true);
    expect(isInvitationNotFoundError(new InvitationNotFoundError())).toBe(true);
    expect(isInvitationNotFoundError(foreign("InvitationNotFoundError"))).toBe(true);
    expect(isInvitationInputError(new InvitationInputError())).toBe(true);
    expect(isInvitationInputError(foreign("InvitationInputError"))).toBe(true);
  });

  it("no confunde un error con otro ni con valores que no son errores", () => {
    expect(isInvitationForbiddenError(new InvitationNotFoundError())).toBe(false);
    expect(isInvitationNotFoundError("InvitationNotFoundError")).toBe(false);
    expect(isInvitationInputError(null)).toBe(false);
  });
});
