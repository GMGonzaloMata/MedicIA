import { z } from "zod";

import { ANALYSIS_MODEL_TIMEOUT_MS, ANALYSIS_STALE_AFTER_MS, type AnalysisActor, type AnalysisFailureCode } from "../../domain/analysis";
import { AnalysisNotFoundError, ModelInferenceError } from "../../domain/analysis-errors";
import { createUnifiedReport, parseUnifiedReport, publishUnifiedReport, type UnifiedReportPublication } from "../../domain/unified-report";
import type { IntegratedAnalysisComponent, IntegratedAnalysisEntry, IntegratedAnalysisRepository } from "../ports/out/analysis-repository";
import type { RawEcgInference } from "../ports/out/raw-ecg-inference";
import type { IntegratedStudySource } from "../ports/out/study-source";

export interface RequestIntegratedAnalysisDependencies {
  analyses: IntegratedAnalysisRepository;
  studySource: IntegratedStudySource;
  rawEcgInference: RawEcgInference;
  now: () => Date;
  generateId: () => string;
}
export interface RequestIntegratedAnalysisResult {
  analysis: UnifiedReportPublication;
  // Solo el caller autorizado lo programa; cargar o consultar un estudio no lo ejecuta.
  run: () => Promise<void>;
}

const COMPONENTS = ["echonext", "e022"] as const;
// Un pedido tiene a lo sumo claim + dos inicios + dos terminales. Solo se reconcilia si avanzó revisión.
const MAX_CAS_ATTEMPTS = 6;
const reference = z.string().max(128).refine((value) => value.trim().length > 0);
const capability = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("AVAILABLE"), preprocessingReference: reference }),
  z.strictObject({ status: z.literal("NOT_AVAILABLE"), reason: reference }),
]);
const capabilitiesSchema = z.strictObject({ echonext: capability, e022: capability });
const replySchema = z.strictObject({
  component: z.enum(COMPONENTS), modelName: reference, modelVersion: reference,
  preprocessingReference: reference, result: z.unknown(),
});

// El límite resuelve aunque el adaptador ignore abort; ningún outcome tardío tiene continuación de escritura.
async function withDeadline(input: {
  predict: (signal: AbortSignal) => Promise<unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const controller = new AbortController();
  let abort = () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelled = new Promise<never>((resolve, reject) => {
    void resolve;
    abort = () => { controller.abort(); reject(new ModelInferenceError("TIMEOUT")); };
    timer = setTimeout(abort, input.timeoutMs);
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
  });
  try {
    const outcome = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new ModelInferenceError("TIMEOUT");
      return input.predict(controller.signal);
    });
    return await Promise.race([outcome, cancelled]);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }
}

export function createRequestIntegratedAnalysis({ analyses, studySource, rawEcgInference, now, generateId }: RequestIntegratedAnalysisDependencies) {
  return async ({ actor, studyId, capability: selected, signal }: {
    actor: AnalysisActor; studyId: string; capability: "ECG_UNIFIED_V1"; signal?: AbortSignal;
  }): Promise<RequestIntegratedAnalysisResult> => {
    const authorization = await studySource.authorize({ actor, studyId });
    if (authorization.status === "NO_ACCESS") throw new AnalysisNotFoundError();
    if (selected !== "ECG_UNIFIED_V1") throw new ModelInferenceError("INPUT_REJECTED");
    const snapshot = (() => {
      try {
        return capabilitiesSchema.parse(rawEcgInference.getCapabilities());
      } catch {
        throw new ModelInferenceError("MODEL_UNAVAILABLE");
      }
    })();
    const requested = COMPONENTS.filter((key) => snapshot[key].status === "AVAILABLE");
    if (requested.length === 0) throw new ModelInferenceError("MODEL_UNAVAILABLE");
    const input = await studySource.readExtraction({ actor, studyId });
    if (input.status === "NO_ACCESS") throw new AnalysisNotFoundError();
    if (input.status === "UNSUPPORTED_FORMAT") throw new ModelInferenceError("INPUT_REJECTED");
    const requestedAt = now();
    // Barrido integrado real antes del arbitraje; failStale legacy nunca es su sustituto.
    await analyses.expireIntegratedStale({ tenantId: actor.tenantId, studyId, now: requestedAt });
    const report = createUnifiedReport({
      analysisId: generateId(), studyId, requestedByUserId: actor.userId, requestedAt: requestedAt.toISOString(),
      capabilities: Object.fromEntries(COMPONENTS.map((key) => [key, snapshot[key].status === "AVAILABLE" ? { status: "AVAILABLE" } : snapshot[key]])),
    });
    const pending = await analyses.insertIntegratedPending({
      tenantId: actor.tenantId, studyId, requestedByUserId: actor.userId, integratedResult: report,
    });
    const scope = { tenantId: actor.tenantId, studyId, analysisId: pending.id };
    const read = () => analyses.findIntegratedById(scope);
    const active = (entry: IntegratedAnalysisEntry) => entry.status === "PENDING" || entry.status === "PROCESSING";

    async function mutate(applies: (entry: IntegratedAnalysisEntry) => boolean, write: (entry: IntegratedAnalysisEntry) => Promise<boolean>): Promise<IntegratedAnalysisEntry | null> {
      let entry = await read();
      for (let attempt = 0; entry && attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        if (!active(entry) || !applies(entry)) return null;
        if (await write(entry)) return read();
        const current = await read();
        if (!current || current.revision <= entry.revision) return null;
        entry = current;
      }
      return null;
    }
    const expire = () => mutate(active, (entry) => analyses.expireIntegrated({ ...scope, expectedRevision: entry.revision, now: now() }));
    async function fail(component: IntegratedAnalysisComponent, failureCode: AnalysisFailureCode): Promise<void> {
      await expire();
      await mutate((entry) => {
        const execution = entry.integratedResult.components[component];
        return entry.status === "PROCESSING" && (execution?.status === "PENDING" || execution?.status === "PROCESSING");
      }, (entry) => {
        const execution = entry.integratedResult.components[component];
        const finishedAt = now();
        return analyses.finishIntegratedComponent({ ...scope, expectedRevision: entry.revision, component, now: finishedAt,
          execution: { ...execution, status: "FAILED", failureCode, result: null, finishedAt: finishedAt.toISOString() },
        });
      });
    }
    async function execute(component: IntegratedAnalysisComponent): Promise<void> {
      try {
        if (input.status !== "READY") { await fail(component, "STUDY_FILE_UNAVAILABLE"); return; }
        if (signal?.aborted) { await fail(component, "TIMEOUT"); return; }
        const configuration = snapshot[component];
        if (configuration.status !== "AVAILABLE") return;
        await expire();
        const started = await mutate((entry) => entry.status === "PROCESSING" && entry.integratedResult.components[component]?.status === "PENDING",
          (entry) => analyses.startIntegratedComponent({ ...scope, expectedRevision: entry.revision, component, startedAt: now(), preprocessingReference: configuration.preprocessingReference }));
        const execution = started?.integratedResult.components[component];
        if (!execution || execution.status !== "PROCESSING") return;
        const reply = replySchema.parse(await withDeadline({
          predict: (signal) => rawEcgInference.predict({ component, extraction: input.extraction, signal }), signal,
          timeoutMs: Math.max(0, Math.min(ANALYSIS_MODEL_TIMEOUT_MS - (now().getTime() - Date.parse(execution.startedAt)), ANALYSIS_STALE_AFTER_MS - (now().getTime() - pending.requestedAt.getTime()))),
        }));
        if (reply.component !== component || reply.preprocessingReference !== configuration.preprocessingReference) throw new ModelInferenceError("INTERNAL");
        await expire();
        await mutate((entry) => entry.status === "PROCESSING" && entry.integratedResult.components[component]?.status === "PROCESSING", (entry) => {
          const finishedAt = now();
          // Reutiliza el validador completo: no acepta un subconjunto de EchoNext ni FEVI numérica.
          const checked = parseUnifiedReport({ ...entry.integratedResult, components: { ...entry.integratedResult.components,
            [component]: { ...execution, status: "COMPLETED", modelName: reply.modelName, modelVersion: reply.modelVersion,
              preprocessingReference: reply.preprocessingReference, result: reply.result, finishedAt: finishedAt.toISOString() },
          } });
          return analyses.finishIntegratedComponent({ ...scope, expectedRevision: entry.revision, component, execution: checked.components[component], now: finishedAt });
        });
      } catch (error) {
        await fail(component, error instanceof ModelInferenceError ? error.code : "INTERNAL");
      }
    }
    const run = async (): Promise<void> => {
      try {
        await expire();
        const claimed = await mutate((entry) => entry.status === "PENDING", (entry) => analyses.claimIntegrated({ ...scope, expectedRevision: entry.revision, startedAt: now() }));
        if (!claimed || claimed.status !== "PROCESSING") return;
        await Promise.all(requested.map(execute));
      } catch {
        console.error(`[análisis integrado] no se pudo ejecutar id=${pending.id}`);
        try {
          await Promise.all(requested.map((component) => fail(component, "INTERNAL")));
        } catch {
          console.error(`[análisis integrado] no se pudo registrar la falla id=${pending.id}`);
        }
      }
    };
    return { analysis: publishUnifiedReport(pending.integratedResult), run };
  };
}
