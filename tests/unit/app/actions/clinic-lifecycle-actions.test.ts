import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLINIC_MESSAGES } from "@/app/(dashboard)/clinic/_lib/clinic-messages";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const tenantsModule = vi.hoisted(() => ({
  deactivateMember: vi.fn(),
  reactivateMember: vi.fn(),
  endAssignment: vi.fn(),
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

import { deactivateMemberAction } from "@/app/(dashboard)/clinic/_actions/deactivate-member";
import { endAssignmentAction } from "@/app/(dashboard)/clinic/_actions/end-assignment";
import { reactivateMemberAction } from "@/app/(dashboard)/clinic/_actions/reactivate-member";

const ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const ADMIN = { kind: "STAFF", membershipId: "membership-1", isClinicAdmin: true, isDoctor: false };
const ACTOR = { tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1" };

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

function form(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(ready(ADMIN));
  for (const useCase of Object.values(tenantsModule)) {
    useCase.mockResolvedValue({ ok: true });
  }
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const ACTIONS = [
  { name: "desactivar", field: "membershipId", action: deactivateMemberAction, useCase: tenantsModule.deactivateMember, path: "/clinic/staff" },
  { name: "reactivar", field: "membershipId", action: reactivateMemberAction, useCase: tenantsModule.reactivateMember, path: "/clinic/staff" },
  { name: "terminar asignación", field: "assignmentId", action: endAssignmentAction, useCase: tenantsModule.endAssignment, path: "/clinic/patients" },
];

describe.each(ACTIONS)("acción de $name", ({ field, action, useCase, path }) => {
  it.each([
    { $name: "un médico sin rol de administrador", result: ready({ ...ADMIN, isClinicAdmin: false, isDoctor: true }) },
    { $name: "un paciente", result: ready({ kind: "PATIENT", patientId: "patient-1" }) },
    { $name: "una persona sin clínica", result: { isAuthorized: false, reason: "no-clinic" } },
  ])("rechaza a $name sin llamar al caso de uso", async ({ result }) => {
    access.requireClinicContextForAction.mockResolvedValue(result);

    expect(await action(undefined, form({ [field]: ID }))).toEqual({ status: "error", message: CLINIC_MESSAGES.forbidden });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("redirige a ingresar si no hay sesión", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });

    await expect(action(undefined, form({ [field]: ID }))).rejects.toThrow("REDIRECT:/sign-in");
    expect(useCase).not.toHaveBeenCalled();
  });

  it("trata un identificador mal formado como inexistente", async () => {
    expect(await action(undefined, form({ [field]: "no-es-uuid" }))).toEqual({ status: "error", message: CLINIC_MESSAGES.notFound });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("delega con el actor de la sesión, sin clínica del formulario, y actualiza la pantalla", async () => {
    expect(await action(undefined, form({ [field]: ID, tenantId: "otra" }))).toMatchObject({ status: "success" });

    expect(useCase).toHaveBeenCalledWith({ actor: ACTOR, [field]: ID });
    expect(revalidatePath).toHaveBeenCalledWith(path);
  });

  it("registra solo el nombre del error inesperado", async () => {
    useCase.mockRejectedValue(new TypeError("dato@personal.com"));

    expect(await action(undefined, form({ [field]: ID }))).toEqual({ status: "error", message: CLINIC_MESSAGES.unavailable });
    expect(console.error).toHaveBeenCalledWith("[clínica] error inesperado: TypeError");
  });
});

describe("mensajes de rechazo", () => {
  it.each([
    ["LAST_ADMIN", CLINIC_MESSAGES.lastAdmin],
    ["ALREADY_DEACTIVATED", CLINIC_MESSAGES.alreadyDeactivated],
    ["NOT_FOUND", CLINIC_MESSAGES.notFound],
  ])("desactivar traduce %s", async (code, message) => {
    tenantsModule.deactivateMember.mockResolvedValue({ ok: false, code });

    expect(await deactivateMemberAction(undefined, form({ membershipId: ID }))).toEqual({ status: "error", message });
  });

  it.each([
    ["ALREADY_ACTIVE", CLINIC_MESSAGES.alreadyActive],
    ["NOT_FOUND", CLINIC_MESSAGES.notFound],
  ])("reactivar traduce %s", async (code, message) => {
    tenantsModule.reactivateMember.mockResolvedValue({ ok: false, code });

    expect(await reactivateMemberAction(undefined, form({ membershipId: ID }))).toEqual({ status: "error", message });
  });

  it.each([
    ["ALREADY_ENDED", CLINIC_MESSAGES.alreadyEnded],
    ["NOT_FOUND", CLINIC_MESSAGES.notFound],
  ])("terminar asignación traduce %s", async (code, message) => {
    tenantsModule.endAssignment.mockResolvedValue({ ok: false, code });

    expect(await endAssignmentAction(undefined, form({ assignmentId: ID }))).toEqual({ status: "error", message });
  });

  it("el rechazo del último administrador indica el siguiente paso", () => {
    expect(CLINIC_MESSAGES.lastAdmin).toMatch(/sumá otro administrador/);
  });
});
