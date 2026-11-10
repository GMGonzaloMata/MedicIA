import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudyForbiddenError,
  StudyInUseError,
  StudyNotFoundError,
} from "@/modules/studies/domain/study-errors";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const studiesModule = vi.hoisted(() => ({ deleteStudy: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/access", () => access);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/modules/studies/composition", () => ({ getStudiesModule: () => studiesModule }));

import { deleteStudyAction } from "@/app/(dashboard)/_studies/_actions/delete-study";

const STUDY_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";

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

function form(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(ready({ kind: "PATIENT", patientId: "patient-1" }));
  studiesModule.deleteStudy.mockResolvedValue({ fileLeftBehind: false });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de eliminar un estudio", () => {
  it("elimina con el actor de la sesión y actualiza las listas", async () => {
    const result = await deleteStudyAction(undefined, form({ studyId: STUDY_ID }));

    expect(result).toEqual({ ok: true });
    expect(studiesModule.deleteStudy).toHaveBeenCalledWith({
      actor: { kind: "PATIENT", tenantId: "tenant-1", userId: "user-1", patientId: "patient-1" },
      studyId: STUDY_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/studies");
  });

  it("nunca toma la clave del archivo ni la clínica del formulario", async () => {
    await deleteStudyAction(undefined, form({ studyId: STUDY_ID, storageKey: "studies/otra/x.ecg1", tenantId: "otra" }));

    const call = studiesModule.deleteStudy.mock.calls[0]?.[0];
    expect(Object.keys(call).sort()).toEqual(["actor", "studyId"]);
    expect(call.actor.tenantId).toBe("tenant-1");
  });

  it("valida que el identificador sea un UUID", async () => {
    expect(await deleteStudyAction(undefined, form({ studyId: "no-es-uuid" }))).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await deleteStudyAction(undefined, form({}))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(studiesModule.deleteStudy).not.toHaveBeenCalled();
  });

  it("rechaza sin sesión y al administrador sin rol de médico", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });
    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "FORBIDDEN" });

    access.requireClinicContextForAction.mockResolvedValue(
      ready({ kind: "STAFF", membershipId: "m", isClinicAdmin: true, isDoctor: false }),
    );
    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "FORBIDDEN" });
    expect(studiesModule.deleteStudy).not.toHaveBeenCalled();
  });

  it("traduce los errores del caso de uso a códigos estables", async () => {
    studiesModule.deleteStudy.mockRejectedValueOnce(new StudyNotFoundError());
    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "NOT_FOUND" });

    studiesModule.deleteStudy.mockRejectedValueOnce(new StudyForbiddenError());
    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "FORBIDDEN" });

    studiesModule.deleteStudy.mockRejectedValueOnce(new StudyInUseError());
    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "IN_USE" });

    studiesModule.deleteStudy.mockRejectedValueOnce(new TypeError("dato 12345"));
    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "UNAVAILABLE" });
    expect(vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("")).not.toContain("12345");
  });

  it("avisa cuando el archivo quedó pendiente de limpieza", async () => {
    studiesModule.deleteStudy.mockResolvedValue({ fileLeftBehind: true });

    expect(await deleteStudyAction(undefined, form({ studyId: STUDY_ID }))).toEqual({
      ok: true,
      warning: "El estudio se eliminó, pero su archivo quedó pendiente de limpieza.",
    });
  });
});
