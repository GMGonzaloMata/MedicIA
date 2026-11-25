import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLINIC_MESSAGES } from "@/app/(dashboard)/clinic/_lib/clinic-messages";

const access = vi.hoisted(() => ({ getAccessContext: vi.fn() }));
const sessionCookie = vi.hoisted(() => ({ readSessionToken: vi.fn() }));
const tenantsModule = vi.hoisted(() => ({ linkPatientAccount: vi.fn() }));
const usersModule = vi.hoisted(() => ({ selectActiveClinic: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);

vi.mock("@/app/_lib/access", () => access);
vi.mock("@/app/_lib/session-cookie", () => sessionCookie);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/modules/tenants/composition", () => ({ getTenantsModule: () => tenantsModule }));
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => usersModule }));

import { linkPatientAction } from "@/app/(dashboard)/link-patient/_actions/link-patient";

const USER = { id: "user-1", email: "persona@example.com", fullName: "Ana Paciente", isPlatformAdmin: false };
const READY = {
  status: "ready",
  user: USER,
  clinic: { tenantId: "tenant-0", tenantName: "Otra", relationship: { kind: "PATIENT", patientId: "patient-0" } },
};
const NO_CLINIC = { status: "no-clinic", user: USER };

function form(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

const valid = () => form({ documentType: "DNI", documentNumber: "12.345.678", code: "ABCDE-FGHJK" });

beforeEach(() => {
  vi.clearAllMocks();
  access.getAccessContext.mockResolvedValue(NO_CLINIC);
  sessionCookie.readSessionToken.mockResolvedValue("token-sesion");
  tenantsModule.linkPatientAccount.mockResolvedValue({ ok: true, tenantId: "tenant-1", patientId: "patient-1" });
  usersModule.selectActiveClinic.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("quién puede vincular", () => {
  it.each([
    { $name: "una persona sin clínica", context: NO_CLINIC },
    { $name: "una persona que ya tiene una clínica", context: READY },
  ])("acepta a $name", async ({ context }) => {
    access.getAccessContext.mockResolvedValue(context);

    await expect(linkPatientAction(undefined, valid())).rejects.toThrow("REDIRECT:/");
    expect(tenantsModule.linkPatientAccount).toHaveBeenCalledTimes(1);
  });

  it("rechaza a un anónimo sin llamar al caso de uso", async () => {
    access.getAccessContext.mockResolvedValue({ status: "anonymous" });

    await expect(linkPatientAction(undefined, valid())).rejects.toThrow("REDIRECT:/sign-in");
    expect(tenantsModule.linkPatientAccount).not.toHaveBeenCalled();
  });
});

describe("vinculación correcta", () => {
  it("usa la persona de la sesión, nunca datos del formulario, y deja activa la clínica nueva", async () => {
    const formData = valid();
    formData.set("userId", "otra-persona");
    formData.set("tenantId", "otra-clinica");

    await expect(linkPatientAction(undefined, formData)).rejects.toThrow("REDIRECT:/");

    expect(tenantsModule.linkPatientAccount).toHaveBeenCalledWith({
      user: { id: "user-1", fullName: "Ana Paciente" },
      documentType: "DNI",
      documentNumber: "12.345.678",
      code: "ABCDE-FGHJK",
    });
    expect(usersModule.selectActiveClinic).toHaveBeenCalledWith({
      token: "token-sesion",
      kind: "PATIENT",
      relationshipId: "patient-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("el mismo mensaje para todo fallo", () => {
  it("LINK_FAILED es siempre el mismo mensaje, sin importar la causa", async () => {
    tenantsModule.linkPatientAccount.mockResolvedValue({ ok: false, code: "LINK_FAILED" });

    const first = await linkPatientAction(undefined, valid());
    const second = await linkPatientAction(undefined, form({ documentType: "DNI", documentNumber: "99999999", code: "ZZZZZ-ZZZZZ" }));

    expect(first).toEqual({ status: "error", message: CLINIC_MESSAGES.linkFailed });
    expect(second).toEqual(first);
    expect(usersModule.selectActiveClinic).not.toHaveBeenCalled();
  });

  it.each([
    ["TOO_MANY_ATTEMPTS", CLINIC_MESSAGES.tooManyAttempts],
    ["INVALID_INPUT", CLINIC_MESSAGES.invalidInput],
  ])("traduce %s a un mensaje con el siguiente paso", async (code, message) => {
    tenantsModule.linkPatientAccount.mockResolvedValue({ ok: false, code });

    expect(await linkPatientAction(undefined, valid())).toEqual({ status: "error", message });
  });

  it("el mensaje de fallo no repite el documento ni el código", async () => {
    tenantsModule.linkPatientAccount.mockResolvedValue({ ok: false, code: "LINK_FAILED" });

    const result = await linkPatientAction(undefined, valid());

    expect(result.message).not.toMatch(/12345678|12\.345\.678|ABCDE/);
  });

  it.each([
    { $name: "documento ausente", fields: { documentType: "DNI", code: "ABCDE-FGHJK" } },
    { $name: "código ausente", fields: { documentType: "DNI", documentNumber: "12345678" } },
    { $name: "campos vacíos", fields: {} },
  ] as { $name: string; fields: Record<string, string> }[])("rechaza $name sin llamar al caso de uso", async ({ fields }) => {
    expect(await linkPatientAction(undefined, form(fields))).toEqual({
      status: "error",
      message: CLINIC_MESSAGES.invalidInput,
    });
    expect(tenantsModule.linkPatientAccount).not.toHaveBeenCalled();
  });

  it("registra solo el nombre de un error inesperado", async () => {
    tenantsModule.linkPatientAccount.mockRejectedValue(new TypeError("12345678"));

    expect(await linkPatientAction(undefined, valid())).toEqual({ status: "error", message: CLINIC_MESSAGES.unavailable });
    expect(console.error).toHaveBeenCalledWith("[clínica] error inesperado: TypeError");
  });
});
