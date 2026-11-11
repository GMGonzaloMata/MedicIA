import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationSummary } from "@/modules/users/domain/invitation";

vi.mock("@/app/(dashboard)/_invitations/_actions/revoke-invitation", () => ({ revokeInvitation: vi.fn() }));

import { PendingInvitations } from "@/app/(dashboard)/_invitations/_components/pending-invitations";

// jsdom no implementa los métodos de `<dialog>`.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

beforeEach(() => {
  showModal.mockClear();
  close.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

function invitation(overrides: Partial<InvitationSummary>): InvitationSummary {
  return {
    id: "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f",
    kind: "DOCTOR",
    email: "dra@example.com",
    expiresAt: new Date("2026-11-18T15:00:00Z"),
    createdAt: new Date("2026-11-11T15:00:00Z"),
    sentAt: new Date("2026-11-11T15:00:01Z"),
    createdByName: "Ana Admin",
    ...overrides,
  };
}

describe("lista de invitaciones pendientes", () => {
  it("sin invitaciones muestra un estado vacío con texto", () => {
    render(<PendingInvitations invitations={[]} showCreator />);

    expect(screen.getByText("No hay invitaciones pendientes.")).toBeTruthy();
  });

  it("muestra correo, tipo, vencimiento y el estado con texto", () => {
    render(
      <PendingInvitations
        invitations={[
          invitation({}),
          invitation({ id: "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e60", kind: "PATIENT", email: "pac@example.com", sentAt: null }),
        ]}
        showCreator={false}
      />,
    );

    expect(screen.getByText("dra@example.com")).toBeTruthy();
    expect(screen.getByText(/Médico · Vence el 18 nov 2026/)).toBeTruthy();
    expect(screen.getByText("Enviada")).toBeTruthy();
    expect(screen.getByText(/Paciente · Vence el/)).toBeTruthy();
    expect(screen.getByText("Envío fallido")).toBeTruthy();
  });

  it("muestra quién generó el link solo cuando se pide", () => {
    const { rerender } = render(<PendingInvitations invitations={[invitation({})]} showCreator />);
    expect(screen.getByText(/Generada por Ana Admin/)).toBeTruthy();

    rerender(<PendingInvitations invitations={[invitation({})]} showCreator={false} />);
    expect(screen.queryByText(/Generada por/)).toBeNull();
  });

  it("revocar abre una confirmación y no envía nada hasta confirmar", () => {
    const { container } = render(<PendingInvitations invitations={[invitation({})]} showCreator />);

    fireEvent.click(screen.getByRole("button", { name: "Revocar la invitación a dra@example.com" }));

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(container.querySelector("dialog")?.textContent).toContain("dejará de servir de inmediato");
    expect((container.querySelector("input[name=invitationId]") as HTMLInputElement).value).toBe(
      "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f",
    );
  });

  it("Cancelar cierra el diálogo", () => {
    render(<PendingInvitations invitations={[invitation({})]} showCreator />);
    fireEvent.click(screen.getByRole("button", { name: "Revocar la invitación a dra@example.com" }));

    fireEvent.click(screen.getByText("Cancelar"));

    expect(close).toHaveBeenCalledTimes(1);
  });
});
