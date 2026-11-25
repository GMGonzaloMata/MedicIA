import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLINIC_MESSAGES } from "@/app/(dashboard)/clinic/_lib/clinic-messages";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const tenantsModule = vi.hoisted(() => ({
  inviteStaff: vi.fn(),
  revokeInvitation: vi.fn(),
  resendInvitation: vi.fn(),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);

vi.mock("@/app/_lib/access", () => access);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/modules/tenants/composition", () => ({ getTenantsModule: () => tenantsModule }));

import { inviteStaffAction } from "@/app/(dashboard)/clinic/_actions/invite-staff";
import { resendInvitationAction } from "@/app/(dashboard)/clinic/_actions/resend-invitation";
import { revokeInvitationAction } from "@/app/(dashboard)/clinic/_actions/revoke-invitation";

const INVITATION_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";

function ready(relationship: unknown) {
  return {
    isAuthorized: true,
    context: {
      status: "ready",
      user: { id: "user-1", email: "admin@example.com", fullName: "Admin", isPlatformAdmin: false },
      clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship },
    },
  };
}

const ADMIN = { kind: "STAFF", membershipId: "membership-1", isClinicAdmin: true, isDoctor: false };

function form(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

const inviteForm = () => form({ email: "nueva@example.com", isClinicAdmin: "on" });

beforeEach(() => {
  vi.clearAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(ready(ADMIN));
  tenantsModule.inviteStaff.mockResolvedValue({ ok: true, invitationId: INVITATION_ID });
  tenantsModule.revokeInvitation.mockResolvedValue({ ok: true });
  tenantsModule.resendInvitation.mockResolvedValue({ ok: true, invitationId: INVITATION_ID });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const ACTIONS = [
  { name: "invitar", run: () => inviteStaffAction(undefined, inviteForm()), useCase: tenantsModule.inviteStaff },
  {
    name: "anular",
    run: () => revokeInvitationAction(undefined, form({ invitationId: INVITATION_ID })),
    useCase: tenantsModule.revokeInvitation,
  },
  {
    name: "reenviar",
    run: () => resendInvitationAction(undefined, form({ invitationId: INVITATION_ID })),
    useCase: tenantsModule.resendInvitation,
  },
];

describe.each(ACTIONS)("acción de $name: autorización", ({ run, useCase }) => {
  it.each([
    { $name: "un médico sin rol de administrador", result: ready({ ...ADMIN, isClinicAdmin: false, isDoctor: true }) },
    { $name: "un paciente", result: ready({ kind: "PATIENT", patientId: "patient-1" }) },
    { $name: "una persona sin clínica", result: { isAuthorized: false, reason: "no-clinic" } },
  ])("rechaza a $name sin llamar al caso de uso", async ({ result }) => {
    access.requireClinicContextForAction.mockResolvedValue(result);

    expect(await run()).toEqual({ status: "error", message: CLINIC_MESSAGES.forbidden });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("redirige a ingresar si no hay sesión y no llama al caso de uso", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });

    await expect(run()).rejects.toThrow("REDIRECT:/sign-in");
    expect(useCase).not.toHaveBeenCalled();
  });

  it("registra solo el nombre del error inesperado", async () => {
    useCase.mockRejectedValue(new TypeError("dato@personal.com"));

    expect(await run()).toEqual({ status: "error", message: CLINIC_MESSAGES.unavailable });
    expect(console.error).toHaveBeenCalledWith("[clínica] error inesperado: TypeError");
  });
});

describe("acción de invitar", () => {
  it("usa el actor de la sesión y nunca una clínica del formulario", async () => {
    const result = await inviteStaffAction(undefined, form({ email: "nueva@example.com", isClinicAdmin: "on", tenantId: "otra" }));

    expect(result).toMatchObject({ status: "success" });
    const call = tenantsModule.inviteStaff.mock.calls[0]?.[0];
    expect(call.actor).toEqual({ tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1" });
    expect(Object.keys(call).sort()).toEqual(["actor", "doctor", "email", "roles"]);
    expect(revalidatePath).toHaveBeenCalledWith("/clinic/staff");
  });

  it("envía especialidad y matrícula solo si el rol es médico", async () => {
    await inviteStaffAction(undefined, form({ email: "a@example.com", isDoctor: "on", specialty: "Cardiología", licenseNumber: "MP-1" }));
    await inviteStaffAction(undefined, form({ email: "b@example.com", isClinicAdmin: "on", specialty: "Cardiología", licenseNumber: "MP-2" }));

    expect(tenantsModule.inviteStaff.mock.calls[0]?.[0]).toMatchObject({
      roles: { isClinicAdmin: false, isDoctor: true },
      doctor: { specialty: "Cardiología", licenseNumber: "MP-1" },
    });
    expect(tenantsModule.inviteStaff.mock.calls[1]?.[0].doctor).toBeNull();
  });

  it("rechaza un correo vacío sin llamar al caso de uso", async () => {
    expect(await inviteStaffAction(undefined, form({ email: "  ", isClinicAdmin: "on" }))).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.invalidInput,
    });
    expect(tenantsModule.inviteStaff).not.toHaveBeenCalled();
  });

  it.each([
    ["ALREADY_MEMBER", CLINIC_MESSAGES.alreadyMember],
    ["MEMBER_DEACTIVATED", CLINIC_MESSAGES.memberDeactivated],
    ["LICENSE_IN_USE", CLINIC_MESSAGES.licenseInUse],
    ["INVALID_INPUT", CLINIC_MESSAGES.invalidInput],
    ["NOT_FOUND", CLINIC_MESSAGES.forbidden],
  ])("traduce %s a un mensaje con el siguiente paso", async (code, message) => {
    tenantsModule.inviteStaff.mockResolvedValue({ ok: false, code });

    expect(await inviteStaffAction(undefined, inviteForm())).toEqual({ status: "error", message });
  });

  it("si falla el correo avisa que la invitación quedó creada y actualiza la lista", async () => {
    tenantsModule.inviteStaff.mockResolvedValue({ ok: false, code: "MAIL_UNAVAILABLE", invitationId: INVITATION_ID });

    expect(await inviteStaffAction(undefined, inviteForm())).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.mailUnavailable,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/clinic/staff");
  });
});

describe.each([
  { name: "anular", action: revokeInvitationAction, useCase: tenantsModule.revokeInvitation },
  { name: "reenviar", action: resendInvitationAction, useCase: tenantsModule.resendInvitation },
])("acción de $name una invitación", ({ action, useCase }) => {
  it("trata un identificador mal formado como inexistente", async () => {
    expect(await action(undefined, form({ invitationId: "no-es-uuid" }))).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.notFound,
    });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("trata una invitación ajena como inexistente", async () => {
    useCase.mockResolvedValue({ ok: false, code: "NOT_FOUND" });

    expect(await action(undefined, form({ invitationId: INVITATION_ID }))).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.notFound,
    });
  });

  it("delega con el actor de la sesión y actualiza la lista", async () => {
    expect(await action(undefined, form({ invitationId: INVITATION_ID }))).toMatchObject({ status: "success" });
    expect(useCase).toHaveBeenCalledWith({
      actor: { tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1" },
      invitationId: INVITATION_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/clinic/staff");
  });
});

describe("mensajes de rechazo", () => {
  it("todos indican qué hacer después (no son un error técnico)", () => {
    for (const message of Object.values(CLINIC_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/error|exception|undefined|null/i);
    }
  });
});
