import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLINIC_MESSAGES } from "@/app/(dashboard)/clinic/_lib/clinic-messages";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const tenantsModule = vi.hoisted(() => ({
  registerPatient: vi.fn(),
  regeneratePatientLinkCode: vi.fn(),
  assignPatient: vi.fn(),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);
const cookies = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/access", () => access);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/modules/tenants/composition", () => ({ getTenantsModule: () => tenantsModule }));

import { assignPatientAction } from "@/app/(dashboard)/clinic/_actions/assign-patient";
import { regenerateLinkCodeAction } from "@/app/(dashboard)/clinic/_actions/regenerate-link-code";
import { registerPatientAction } from "@/app/(dashboard)/clinic/_actions/register-patient";

const PATIENT_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const MEMBERSHIP_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e60";
const LINK_CODE = "ABCDE-FGHJK";

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

const registerForm = () => form({ documentType: "DNI", documentNumber: "12345678" });

beforeEach(() => {
  vi.clearAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(ready(ADMIN));
  tenantsModule.registerPatient.mockResolvedValue({ ok: true, patientId: PATIENT_ID, linkCode: LINK_CODE });
  tenantsModule.regeneratePatientLinkCode.mockResolvedValue({ ok: true, linkCode: LINK_CODE });
  tenantsModule.assignPatient.mockResolvedValue({ ok: true, assignmentId: "assignment-1" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const ACTIONS = [
  { name: "alta de paciente", run: () => registerPatientAction(undefined, registerForm()), useCase: tenantsModule.registerPatient },
  {
    name: "código nuevo",
    run: () => regenerateLinkCodeAction(undefined, form({ patientId: PATIENT_ID })),
    useCase: tenantsModule.regeneratePatientLinkCode,
  },
  {
    name: "asignar",
    run: () => assignPatientAction(undefined, form({ patientId: PATIENT_ID, membershipId: MEMBERSHIP_ID })),
    useCase: tenantsModule.assignPatient,
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

  it("redirige a ingresar si no hay sesión", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });

    await expect(run()).rejects.toThrow("REDIRECT:/sign-in");
    expect(useCase).not.toHaveBeenCalled();
  });

  it("registra solo el nombre del error inesperado", async () => {
    useCase.mockRejectedValue(new TypeError("12345678"));

    expect(await run()).toEqual({ status: "error", message: CLINIC_MESSAGES.unavailable });
    expect(console.error).toHaveBeenCalledWith("[clínica] error inesperado: TypeError");
  });
});

describe("el código de vinculación", () => {
  it.each([
    { $name: "el alta", run: () => registerPatientAction(undefined, registerForm()) },
    { $name: "el código nuevo", run: () => regenerateLinkCodeAction(undefined, form({ patientId: PATIENT_ID })) },
  ])("de $name viaja solo en la respuesta, sin URL, cookie ni redirección", async ({ run }) => {
    const result = await run();

    expect(result).toMatchObject({ status: "success", linkCode: LINK_CODE });
    expect(redirect).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
    // Lo único que se revalida es una ruta fija, sin parámetros.
    expect(revalidatePath.mock.calls.flat().join("")).not.toContain(LINK_CODE);
  });

  it("no aparece en ningún mensaje ni registro", async () => {
    const result = await registerPatientAction(undefined, registerForm());

    expect(result.message).not.toContain(LINK_CODE);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("acción de alta de paciente", () => {
  it("usa el actor de la sesión y nunca una clínica del formulario", async () => {
    await registerPatientAction(undefined, form({ documentType: "DNI", documentNumber: "12345678", tenantId: "otra" }));

    const call = tenantsModule.registerPatient.mock.calls[0]?.[0];
    expect(call.actor).toEqual({ tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1" });
    expect(Object.keys(call).sort()).toEqual(["actor", "documentNumber", "documentType"]);
    expect(revalidatePath).toHaveBeenCalledWith("/clinic/patients");
  });

  it.each([
    ["DUPLICATE_PATIENT", CLINIC_MESSAGES.duplicatePatient],
    ["INVALID_INPUT", CLINIC_MESSAGES.invalidInput],
    ["NOT_FOUND", CLINIC_MESSAGES.forbidden],
  ])("traduce %s a un mensaje con el siguiente paso", async (code, message) => {
    tenantsModule.registerPatient.mockResolvedValue({ ok: false, code });

    expect(await registerPatientAction(undefined, registerForm())).toEqual({ status: "error", message });
  });
});

describe("acción de código nuevo", () => {
  it("trata un identificador mal formado como inexistente", async () => {
    expect(await regenerateLinkCodeAction(undefined, form({ patientId: "no-es-uuid" }))).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.notFound,
    });
    expect(tenantsModule.regeneratePatientLinkCode).not.toHaveBeenCalled();
  });

  it.each([
    ["ALREADY_LINKED", CLINIC_MESSAGES.alreadyLinked],
    ["NOT_FOUND", CLINIC_MESSAGES.notFound],
  ])("traduce %s", async (code, message) => {
    tenantsModule.regeneratePatientLinkCode.mockResolvedValue({ ok: false, code });

    expect(await regenerateLinkCodeAction(undefined, form({ patientId: PATIENT_ID }))).toEqual({ status: "error", message });
  });
});

describe("acción de asignar", () => {
  it.each([
    { $name: "paciente mal formado", fields: { patientId: "x", membershipId: MEMBERSHIP_ID } },
    { $name: "médico mal formado", fields: { patientId: PATIENT_ID, membershipId: "x" } },
    { $name: "campos ausentes", fields: {} },
  ] as { $name: string; fields: Record<string, string> }[])("trata $name como inexistente", async ({ fields }) => {
    expect(await assignPatientAction(undefined, form(fields))).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.notFound,
    });
    expect(tenantsModule.assignPatient).not.toHaveBeenCalled();
  });

  it("delega con el actor de la sesión y actualiza la lista", async () => {
    expect(await assignPatientAction(undefined, form({ patientId: PATIENT_ID, membershipId: MEMBERSHIP_ID }))).toMatchObject({
      status: "success",
    });
    expect(tenantsModule.assignPatient).toHaveBeenCalledWith({
      actor: { tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1" },
      patientId: PATIENT_ID,
      membershipId: MEMBERSHIP_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/clinic/patients");
  });

  it.each([
    ["NOT_A_DOCTOR", CLINIC_MESSAGES.notADoctor],
    ["DOCTOR_DEACTIVATED", CLINIC_MESSAGES.doctorDeactivated],
    ["ALREADY_ASSIGNED", CLINIC_MESSAGES.alreadyAssigned],
    ["NOT_FOUND", CLINIC_MESSAGES.notFound],
  ])("traduce %s a un mensaje con el siguiente paso", async (code, message) => {
    tenantsModule.assignPatient.mockResolvedValue({ ok: false, code });

    expect(
      await assignPatientAction(undefined, form({ patientId: PATIENT_ID, membershipId: MEMBERSHIP_ID })),
    ).toEqual({ status: "error", message });
  });
});
