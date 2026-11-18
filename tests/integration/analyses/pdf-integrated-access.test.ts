// Requiere PostgreSQL desechable exclusivo y esquema aplicado por el responsable: resetDatabase TRUNCA tablas.
// SQL real; PDF, almacenamiento y E022 son sintéticos. No acredita lector/modelo/runtime clínico.
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RawEcgInference } from "@/modules/analyses/application/ports/out/raw-ecg-inference";
import { createGetIntegratedAnalysis } from "@/modules/analyses/application/use-cases/get-integrated-analysis";
import { createRequestIntegratedAnalysis } from "@/modules/analyses/application/use-cases/request-integrated-analysis";
import { AnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";
import { prismaAnalysisRepository as analyses } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";
import { createAuthorizeStudy } from "@/modules/studies/application/use-cases/authorize-study";
import { createReadStudyExtraction } from "@/modules/studies/application/use-cases/read-study-extraction";
import { createUploadPdfStudy } from "@/modules/studies/application/use-cases/upload-pdf-study";
import { decodePdfStudy } from "@/modules/studies/domain/pdf-study-format";
import { StudyForbiddenError } from "@/modules/studies/domain/study-errors";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { prismaPatientDirectory as directory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";
import { prismaStudyRepository as studies } from "@/modules/studies/infrastructure/repositories/prisma-study-repository";

import { createAnalysisWorld } from "../../support/analysis-world";
import { resetDatabase } from "../../support/database";

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

const requestedAt = "2026-11-16T10:00:00.000Z";
const executedAt = "2026-11-16T10:00:01.000Z";
const expiredAt = "2026-11-16T10:03:00.000Z";
const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% synthetic-access-only\n%%EOF");
const miniUnavailable = { status: "NOT_AVAILABLE", reason: "Mini no configurado en esta prueba sintética." } as const;

async function setup() {
  // Reutiliza vínculos/asignaciones reales y la carga NPZ previa; no redefine permisos ni fixtures SQL.
  const world = await createAnalysisWorld();
  let time = new Date(requestedAt);
  const readBytes = vi.fn(async () => Uint8Array.from(pdfBytes));
  const extraction = createFakePdfExtraction();
  const extract = vi.spyOn(extraction, "extract");
  const generateStudyId = vi.fn(randomUUID);
  const generateAnalysisId = vi.fn(randomUUID);
  const getCapabilities = vi.fn<RawEcgInference["getCapabilities"]>(() => ({
    echonext: miniUnavailable,
    e022: { status: "AVAILABLE", preprocessingReference: "synthetic-e022-prep-v1" },
  }));
  const predict = vi.fn<RawEcgInference["predict"]>(async () => ({
    component: "e022", modelName: "e022-synthetic", modelVersion: "synthetic-v1",
    preprocessingReference: "synthetic-e022-prep-v1", result: { target: "lvef_lte_45", score: 0.72 },
  }));
  const authorize = createAuthorizeStudy({ studies, directory });
  const readExtraction = createReadStudyExtraction({ studies, storage: world.storage, authorizeStudy: authorize });
  const studySource = { authorize, readExtraction };
  const upload = createUploadPdfStudy({ studies, directory, storage: world.storage, extraction, generateId: generateStudyId });
  const request = createRequestIntegratedAnalysis({
    analyses, studySource, rawEcgInference: { getCapabilities, predict }, now: () => time, generateId: generateAnalysisId,
  });
  const query = createGetIntegratedAnalysis({ analyses, studySource, now: () => time });
  // Son espías sin mockImplementation: cada operación sigue usando los repositorios SQL reales.
  const guardedCalls = [
    readBytes, extract, generateStudyId, generateAnalysisId, getCapabilities, predict,
    vi.spyOn(world.storage, "get"), vi.spyOn(world.storage, "put"),
    vi.spyOn(world.storage, "delete"), vi.spyOn(world.storage, "list"),
    vi.spyOn(studies, "insertWithNextNumber"), vi.spyOn(studies, "deleteById"),
    vi.spyOn(analyses, "insertIntegratedPending"), vi.spyOn(analyses, "claimIntegrated"),
    vi.spyOn(analyses, "startIntegratedComponent"), vi.spyOn(analyses, "finishIntegratedComponent"),
    vi.spyOn(analyses, "expireIntegrated"), vi.spyOn(analyses, "expireIntegratedStale"),
    vi.spyOn(analyses, "findIntegratedById"),
    vi.spyOn(analyses, "insertPending"), vi.spyOn(analyses, "insertFailed"),
    vi.spyOn(analyses, "claim"), vi.spyOn(analyses, "complete"),
    vi.spyOn(analyses, "fail"), vi.spyOn(analyses, "failStale"),
  ];
  const uploadInput = { patientId: world.p1.id, type: "ECG", readBytes, signal: new AbortController().signal };
  const pdf = await upload({ ...uploadInput, actor: world.actors.p1 });
  const scope = { tenantId: world.tenantA.id, studyId: pdf.studyId };
  const requestInput = { studyId: pdf.studyId, capability: "ECG_UNIFIED_V1" as const };
  return {
    ...world, upload, uploadInput, pdf, scope, request, requestInput, query, readExtraction,
    readBytes, extract, predict, getCapabilities,
    effects: () => guardedCalls.map((spy) => spy.mock.calls.length),
    setTime: (value: string) => { time = new Date(value); },
  };
}

type World = Awaited<ReturnType<typeof setup>>;

async function expectAccessError(result: Promise<unknown>, expected: Error) {
  await expect(result).rejects.toBeInstanceOf(expected.constructor);
  await expect(result).rejects.toMatchObject({ name: expected.name, message: expected.message });
}

async function persistedState(w: World, analysisId: string) {
  const objects = await w.storage.list("studies/");
  return {
    ownStudies: await studies.listByPatient({ tenantId: w.tenantA.id, patientId: w.actors.p1.patientId, page: 1, pageSize: 20 }),
    otherPatientStudies: await studies.listByPatient({ tenantId: w.tenantA.id, patientId: w.actors.p2.patientId, page: 1, pageSize: 20 }),
    // Solo interfaces públicas: no se inspeccionan tablas, contadores internos ni campos del doble.
    objects: await Promise.all(objects.map(async (object) => ({ ...object, bytes: await w.storage.get(object.key) }))),
    analysis: await analyses.findIntegratedById({ ...w.scope, analysisId }),
  };
}

describe("PDF → pedido → informe persistido: autorización integrada con SQL real", () => {
  it("el dueño carga y pide; dueño y médico asignado leen el mismo resultado E022 sin ejecutar al consultar", async () => {
    const w = await setup();
    // El fixture compartido consumió el número 1 con NPZ; PDF usa el mismo numerador público.
    expect(w.pdf.number).toBe(2);
    expect(w.readBytes).toHaveBeenCalledTimes(1);
    expect(w.extract).toHaveBeenCalledTimes(1);
    expect(w.predict).not.toHaveBeenCalled();
    expect(w.getCapabilities).not.toHaveBeenCalled();
    const storedStudy = await studies.findById(w.scope);
    expect(storedStudy).toMatchObject({ patientId: w.p1.id, uploadedByUserId: w.actors.p1.userId, number: 2 });
    if (!storedStudy) throw new Error("Falta el estudio PDF persistido.");
    expect(storedStudy.storageKey).toBe(`studies/${w.tenantA.id}/${w.pdf.studyId}.pdfecg1`);
    const storedBytes = await w.storage.get(storedStudy.storageKey);
    if (!storedBytes) throw new Error("Falta el objeto PDF privado.");
    const stored = decodePdfStudy(storedBytes);
    expect(Buffer.from(stored.originalPdfBase64, "base64")).toEqual(Buffer.from(pdfBytes));
    for (const actor of [w.actors.p1, w.actors.doctor1]) {
      expect(await w.readExtraction({ actor, studyId: w.pdf.studyId })).toEqual({ status: "READY", extraction: stored.extraction });
    }

    const pending = await w.request({ ...w.requestInput, actor: w.actors.p1 });
    const target = { ...w.scope, analysisId: pending.analysis.analysisId };
    expect(pending.analysis).toEqual({
      analysisId: target.analysisId, studyId: w.pdf.studyId, requestedAt,
      capabilities: { echonext: miniUnavailable, e022: { status: "AVAILABLE" } },
      components: { e022: { status: "PENDING", startedAt: null, finishedAt: null, failureCode: null } }, coverage: "WAITING",
    });
    expect(await analyses.findIntegratedById(target)).toMatchObject({ status: "PENDING", revision: 0, requestedByUserId: w.actors.p1.userId });
    for (const actor of [w.actors.p1, w.actors.doctor1]) {
      expect(await w.query({ ...target, actor })).toEqual(pending.analysis);
    }
    expect(w.predict).not.toHaveBeenCalled();
    w.setTime(executedAt);
    await pending.run();
    const saved = await analyses.findIntegratedById(target);
    expect(saved).toMatchObject({ status: "COMPLETED", revision: 3, finishedAt: new Date(executedAt), failureCode: null });
    const execution = {
      analysisId: target.analysisId, status: "COMPLETED", startedAt: executedAt, finishedAt: executedAt, failureCode: null,
      modelName: "e022-synthetic", modelVersion: "synthetic-v1", preprocessingReference: "synthetic-e022-prep-v1",
      result: { target: "lvef_lte_45", score: 0.72 },
    };
    expect(saved?.integratedResult.components).toEqual({ e022: execution });
    expect(w.predict).toHaveBeenCalledExactlyOnceWith({ component: "e022", extraction: stored.extraction, signal: expect.any(AbortSignal) });
    const expected = {
      ...pending.analysis, coverage: "PARTIAL",
      components: { e022: { status: "COMPLETED", startedAt: executedAt, finishedAt: executedAt, failureCode: null } },
      contributions: [{ component: "e022", execution }],
    };
    for (const actor of [w.actors.p1, w.actors.doctor1]) {
      expect(await w.query({ ...target, actor })).toEqual(expected);
    }
    expect(w.predict).toHaveBeenCalledTimes(1);
    expect(w.getCapabilities).toHaveBeenCalledTimes(1);
    expect(w.extract).toHaveBeenCalledTimes(1);
    expect(await analyses.findIntegratedById(target)).toEqual(saved);
  });

  it.each([
    { name: "médico de otra clínica", actorKey: "doctorB" },
    { name: "médico sin asignación en la misma clínica", actorKey: "doctor2" },
    { name: "otro paciente de la misma clínica", actorKey: "p2" },
  ] as const)("$name: rechaza carga, extracción, pedido y polling antes de efectos o vencimiento", async ({ actorKey }) => {
    const w = await setup();
    const actor = w.actors[actorKey];
    const pending = await w.request({ ...w.requestInput, actor: w.actors.p1 });
    const target = { ...w.scope, analysisId: pending.analysis.analysisId };
    const before = await persistedState(w, target.analysisId);
    expect(before.analysis).toMatchObject({ status: "PENDING", revision: 0, requestedAt: new Date(requestedAt) });
    // A los 180 s el barrido SÍ vencería este pedido; el actor rechazado no puede dispararlo.
    w.setTime(expiredAt);
    const rejectedOperations = [
      async () => {
        await expectAccessError(w.upload({ ...w.uploadInput, actor }), new StudyForbiddenError());
      },
      async () => {
        expect(await w.readExtraction({ actor, studyId: w.pdf.studyId })).toEqual({ status: "NO_ACCESS" });
      },
      async () => {
        await expectAccessError(w.request({ ...w.requestInput, actor }), new AnalysisNotFoundError());
      },
      async () => {
        await expectAccessError(w.query({ ...target, actor }), new AnalysisNotFoundError());
      },
    ];
    for (const reject of rejectedOperations) {
      const callsBefore = w.effects();
      await reject();
      expect(w.effects()).toEqual(callsBefore);
      expect(await persistedState(w, target.analysisId)).toEqual(before);
    }
    // Solo la consulta legítima vence el pendiente; conserva el contador de estudios y no infiere.
    expect(await w.query({ ...target, actor: w.actors.doctor1 })).toEqual({
      ...pending.analysis, coverage: "NONE",
      components: { e022: { status: "FAILED", startedAt: null, finishedAt: expiredAt, failureCode: "TIMEOUT" } },
    });
    expect(await analyses.findIntegratedById(target)).toMatchObject({ status: "FAILED", revision: 1, failureCode: "TIMEOUT", finishedAt: new Date(expiredAt) });
    expect(w.predict).not.toHaveBeenCalled();
    // Comprueba el numerador por una carga válida, no leyendo study_counters.
    expect(await w.upload({ ...w.uploadInput, actor: w.actors.p1 })).toMatchObject({ number: 3 });
    expect(await analyses.findIntegratedById(target)).toMatchObject({ revision: 1, status: "FAILED" });
  });
});
