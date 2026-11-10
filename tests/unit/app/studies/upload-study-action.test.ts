import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_UPLOAD_BYTES } from "@/modules/studies/domain/ecg-study";
import {
  StudyForbiddenError,
  StudyRejectedError,
  StudyUnavailableError,
} from "@/modules/studies/domain/study-errors";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const studiesModule = vi.hoisted(() => ({ uploadStudy: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/access", () => access);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/modules/studies/composition", () => ({ getStudiesModule: () => studiesModule }));

import { uploadStudyAction } from "@/app/(dashboard)/_studies/_actions/upload-study";

const PATIENT_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const OTHER_PATIENT_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e60";

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

const patientAccess = () => ready({ kind: "PATIENT", patientId: PATIENT_ID });
const doctorAccess = () =>
  ready({ kind: "STAFF", membershipId: "membership-1", isClinicAdmin: false, isDoctor: true });

function form(fields: Record<string, string | File> = {}) {
  const formData = new FormData();
  formData.set("type", "ECG");
  formData.set("file", new File([Uint8Array.from([1, 2, 3])], "estudio.npz"));
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(patientAccess());
  studiesModule.uploadStudy.mockResolvedValue({ studyId: "s-1", number: 4 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de subir un estudio", () => {
  it("el paciente sube a su propio paciente e ignora cualquier patientId o tenantId del formulario", async () => {
    const result = await uploadStudyAction(undefined, form({ patientId: OTHER_PATIENT_ID, tenantId: "otra" }));

    expect(result).toEqual({ ok: true, number: 4 });
    expect(studiesModule.uploadStudy).toHaveBeenCalledTimes(1);
    const call = studiesModule.uploadStudy.mock.calls[0]?.[0];
    expect(call.patientId).toBe(PATIENT_ID);
    expect(call.actor).toEqual({ kind: "PATIENT", tenantId: "tenant-1", userId: "user-1", patientId: PATIENT_ID });
    expect(Object.keys(call).sort()).toEqual(["actor", "bytes", "patientId", "type"]);
    expect(call.bytes).toEqual(Uint8Array.from([1, 2, 3]));
    expect(revalidatePath).toHaveBeenCalledWith("/studies");
  });

  it("el médico sube al paciente que indica", async () => {
    access.requireClinicContextForAction.mockResolvedValue(doctorAccess());

    const result = await uploadStudyAction(undefined, form({ patientId: OTHER_PATIENT_ID }));

    expect(result).toEqual({ ok: true, number: 4 });
    expect(studiesModule.uploadStudy.mock.calls[0]?.[0]).toMatchObject({
      patientId: OTHER_PATIENT_ID,
      actor: { kind: "DOCTOR", membershipId: "membership-1", tenantId: "tenant-1" },
    });
  });

  it("el médico sin un patientId válido no sube nada", async () => {
    access.requireClinicContextForAction.mockResolvedValue(doctorAccess());

    expect(await uploadStudyAction(undefined, form())).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await uploadStudyAction(undefined, form({ patientId: "no-es-un-uuid" }))).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(studiesModule.uploadStudy).not.toHaveBeenCalled();
  });

  it("rechaza a quien no tiene sesión, no tiene clínica o es administrador sin rol de médico", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });
    expect(await uploadStudyAction(undefined, form())).toMatchObject({ ok: false, code: "FORBIDDEN" });

    access.requireClinicContextForAction.mockResolvedValue(
      ready({ kind: "STAFF", membershipId: "m-2", isClinicAdmin: true, isDoctor: false }),
    );
    expect(await uploadStudyAction(undefined, form())).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(studiesModule.uploadStudy).not.toHaveBeenCalled();
  });

  it("pide un archivo cuando falta o está vacío", async () => {
    const withoutFile = form();
    withoutFile.delete("file");

    expect(await uploadStudyAction(undefined, withoutFile)).toMatchObject({ ok: false, code: "FILE_MISSING" });
    expect(await uploadStudyAction(undefined, form({ file: new File([], "vacio.npz") }))).toMatchObject({
      ok: false,
      code: "FILE_MISSING",
    });
    expect(studiesModule.uploadStudy).not.toHaveBeenCalled();
  });

  it("rechaza un archivo de más de 2 MB sin leerlo", async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "grande.npz");

    expect(await uploadStudyAction(undefined, form({ file: big }))).toMatchObject({
      ok: false,
      code: "FILE_TOO_LARGE",
    });
    expect(studiesModule.uploadStudy).not.toHaveBeenCalled();
  });

  it("devuelve el motivo del rechazo del archivo sin repetir valores", async () => {
    studiesModule.uploadStudy.mockRejectedValue(new StudyRejectedError("SEX_INVALID", "tabular"));

    expect(await uploadStudyAction(undefined, form())).toEqual({
      ok: false,
      code: "SEX_INVALID",
      message: "El sexo (primera variable de «tabular») debe ser 0 o 1.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("traduce una falta de permiso del caso de uso a FORBIDDEN", async () => {
    studiesModule.uploadStudy.mockRejectedValue(new StudyForbiddenError());

    expect(await uploadStudyAction(undefined, form())).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("responde que no está disponible si falla el almacenamiento o la base", async () => {
    studiesModule.uploadStudy.mockRejectedValue(new StudyUnavailableError());

    expect(await uploadStudyAction(undefined, form())).toEqual({
      ok: false,
      code: "UNAVAILABLE",
      message: "No pudimos guardar el estudio. Probá de nuevo en unos minutos.",
    });
  });

  it("un error inesperado se registra solo por su nombre", async () => {
    studiesModule.uploadStudy.mockRejectedValue(new TypeError("dato del paciente 12345"));

    expect(await uploadStudyAction(undefined, form())).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    const logged = vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("12345");
  });
});
