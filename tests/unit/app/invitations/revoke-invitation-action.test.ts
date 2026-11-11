import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationNotFoundError } from "@/modules/users/domain/invitation-errors";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const usersModule = vi.hoisted(() => ({ revokeInvitation: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/access", () => access);
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => usersModule }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { revokeInvitation } from "@/app/(dashboard)/_invitations/_actions/revoke-invitation";

const INVITATION_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";

function ready(relationship: unknown) {
  return {
    isAuthorized: true,
    context: {
      status: "ready",
      user: { id: "user-1", email: "persona@example.com", fullName: "Persona", isPlatformAdmin: false },
      clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship },
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(
    ready({ kind: "STAFF", membershipId: "m-1", isClinicAdmin: true, isDoctor: false }),
  );
  usersModule.revokeInvitation.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de revocar una invitación", () => {
  it("revoca con el actor de la sesión y actualiza la lista", async () => {
    expect(await revokeInvitation(undefined, form({ invitationId: INVITATION_ID }))).toEqual({ ok: true });
    expect(usersModule.revokeInvitation).toHaveBeenCalledWith({
      actor: { tenantId: "tenant-1", userId: "user-1", membershipId: "m-1", isClinicAdmin: true, isDoctor: false },
      invitationId: INVITATION_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/invitations");
  });

  it("nunca toma la clínica del formulario", async () => {
    await revokeInvitation(undefined, form({ invitationId: INVITATION_ID, tenantId: "otra" }));

    const call = usersModule.revokeInvitation.mock.calls[0]?.[0];
    expect(Object.keys(call).sort()).toEqual(["actor", "invitationId"]);
    expect(call.actor.tenantId).toBe("tenant-1");
  });

  it("valida que el identificador sea un UUID", async () => {
    expect(await revokeInvitation(undefined, form({ invitationId: "no-es-uuid" }))).toMatchObject({ ok: false });
    expect(await revokeInvitation(undefined, form({}))).toMatchObject({ ok: false });
    expect(usersModule.revokeInvitation).not.toHaveBeenCalled();
  });

  it("sin sesión redirige a ingresar; sin clínica, un paciente o personal sin rol, rechaza", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });
    await expect(revokeInvitation(undefined, form({ invitationId: INVITATION_ID }))).rejects.toThrow("REDIRECT:/sign-in");

    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "no-clinic" });
    expect(await revokeInvitation(undefined, form({ invitationId: INVITATION_ID }))).toMatchObject({ ok: false });

    access.requireClinicContextForAction.mockResolvedValue(ready({ kind: "PATIENT", patientId: "p-1" }));
    expect(await revokeInvitation(undefined, form({ invitationId: INVITATION_ID }))).toMatchObject({ ok: false });
    expect(usersModule.revokeInvitation).not.toHaveBeenCalled();
  });

  it("una invitación que ya no está pendiente muestra el aviso y refresca la lista", async () => {
    usersModule.revokeInvitation.mockRejectedValue(new InvitationNotFoundError());

    expect(await revokeInvitation(undefined, form({ invitationId: INVITATION_ID }))).toEqual({
      ok: false,
      message: "No encontramos la invitación. Puede que ya no esté pendiente.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/invitations");
  });

  it("un error inesperado se registra solo por su nombre", async () => {
    usersModule.revokeInvitation.mockRejectedValue(new TypeError("dato secreto 12345"));

    expect(await revokeInvitation(undefined, form({ invitationId: INVITATION_ID }))).toMatchObject({ ok: false });
    expect(vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("")).not.toContain("12345");
  });
});
