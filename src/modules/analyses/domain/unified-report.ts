import { z } from "zod";

import { ANALYSIS_FAILURE_CODES, type AnalysisRequester } from "./analysis";
import { InvalidProbabilitiesError, parseProbabilities } from "./findings";

const COMPONENT_KEYS = ["echonext", "e022"] as const;
const nonEmptyText = z.string().refine((value) => value.trim().length > 0);
const timestamp = z.iso.datetime();

const capabilitySchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("AVAILABLE") }).readonly(),
  z.strictObject({ status: z.literal("NOT_AVAILABLE"), reason: nonEmptyText }).readonly(),
]);
const capabilitiesSchema = z.strictObject({
  echonext: capabilitySchema,
  e022: capabilitySchema,
}).readonly();

const unstartedFields = {
  analysisId: nonEmptyText,
  modelName: z.null(),
  modelVersion: z.null(),
  preprocessingReference: nonEmptyText.nullable(),
};
const pendingSchema = z.strictObject({
  ...unstartedFields,
  status: z.literal("PENDING"),
  startedAt: z.null(), finishedAt: z.null(), failureCode: z.null(), result: z.null(),
}).readonly();
const processingSchema = z.strictObject({
  ...unstartedFields,
  status: z.literal("PROCESSING"),
  startedAt: timestamp, finishedAt: z.null(), failureCode: z.null(), result: z.null(),
}).readonly();
const failedSchema = z.strictObject({
  analysisId: nonEmptyText,
  status: z.literal("FAILED"),
  startedAt: timestamp.nullable(),
  finishedAt: timestamp,
  failureCode: z.enum(ANALYSIS_FAILURE_CODES),
  modelName: nonEmptyText.nullable(),
  modelVersion: nonEmptyText.nullable(),
  preprocessingReference: nonEmptyText.nullable(),
  result: z.null(),
}).readonly();
const completedFields = {
  analysisId: nonEmptyText,
  status: z.literal("COMPLETED"),
  startedAt: timestamp,
  finishedAt: timestamp,
  failureCode: z.null(),
  modelName: nonEmptyText,
  modelVersion: nonEmptyText,
  preprocessingReference: nonEmptyText,
};

// Se conserva el parser legacy: claves, límites y compuesto propios de EchoNext.
const echoNextResultSchema = z.unknown().transform((value, context) => {
  try {
    return Object.freeze(parseProbabilities(value));
  } catch (error) {
    if (!(error instanceof InvalidProbabilitiesError)) throw error;
    context.addIssue({ code: "custom", message: "Resultado EchoNext inválido." });
    return z.NEVER;
  }
});
const e022ResultSchema = z.strictObject({
  target: z.literal("lvef_lte_45"),
  score: z.number().finite().min(0).max(1),
}).readonly();
const echoNextExecutionSchema = z.discriminatedUnion("status", [
  pendingSchema, processingSchema, failedSchema,
  z.strictObject({ ...completedFields, result: echoNextResultSchema }).readonly(),
]);
const e022ExecutionSchema = z.discriminatedUnion("status", [
  pendingSchema, processingSchema, failedSchema,
  z.strictObject({ ...completedFields, result: e022ResultSchema }).readonly(),
]);

const requestFields = {
  analysisId: nonEmptyText,
  studyId: nonEmptyText,
  requestedByUserId: nonEmptyText,
  requestedAt: timestamp,
  capabilities: capabilitiesSchema,
};
const requestSchema = z.strictObject(requestFields);
const reportSchema = z.strictObject({
  ...requestFields,
  schemaVersion: z.literal("ecg-unified.v1"),
  components: z.strictObject({
    echonext: echoNextExecutionSchema.optional(),
    e022: e022ExecutionSchema.optional(),
  }).readonly(),
}).superRefine((report, context) => {
  let requestedCount = 0;
  for (const key of COMPONENT_KEYS) {
    const isAvailable = report.capabilities[key].status === "AVAILABLE";
    const execution = report.components[key];
    if (isAvailable) requestedCount += 1;
    if (isAvailable !== Object.hasOwn(report.components, key) || (isAvailable && execution === undefined)) {
      context.addIssue({ code: "custom", path: ["components", key], message: "Cobertura inválida." });
    }
    if (!execution) continue;
    // La identidad del estudio y solicitante se hereda del pedido, nunca de otra ejecución.
    if (execution.analysisId !== report.analysisId) {
      context.addIssue({ code: "custom", path: ["components", key], message: "Pedido ajeno." });
    }
    const requestedAt = Date.parse(report.requestedAt);
    const startedAt = execution.startedAt === null ? null : Date.parse(execution.startedAt);
    const finishedAt = execution.finishedAt === null ? null : Date.parse(execution.finishedAt);
    if ((startedAt !== null && startedAt < requestedAt)
      || (finishedAt !== null && finishedAt < (startedAt ?? requestedAt))) {
      context.addIssue({ code: "custom", path: ["components", key], message: "Fechas incoherentes." });
    }
    if ((execution.modelName === null) !== (execution.modelVersion === null)) {
      context.addIssue({ code: "custom", path: ["components", key], message: "Procedencia incompleta." });
    }
  }
  if (requestedCount === 0) {
    context.addIssue({ code: "custom", path: ["capabilities"], message: "Pedido vacío." });
  }
}).readonly();

export type UnifiedReport = z.infer<typeof reportSchema>;
type EchoNextExecution = NonNullable<UnifiedReport["components"]["echonext"]>;
type E022Execution = NonNullable<UnifiedReport["components"]["e022"]>;
type ComponentProgress = Readonly<Pick<E022Execution, "status" | "startedAt" | "finishedAt" | "failureCode">>;
type UnifiedContribution =
  | Readonly<{ component: "echonext"; execution: Extract<EchoNextExecution, { status: "COMPLETED" }> }>
  | Readonly<{ component: "e022"; execution: Extract<E022Execution, { status: "COMPLETED" }> }>;
type PublicationSummary = Readonly<{
  analysisId: string;
  studyId: string;
  requestedAt: string;
  capabilities: UnifiedReport["capabilities"];
  components: Readonly<{ echonext?: ComponentProgress; e022?: ComponentProgress }>;
}>;
export type UnifiedReportPublication = PublicationSummary & (
  | Readonly<{ coverage: "WAITING" | "NONE" }>
  | Readonly<{
    coverage: "COMPLETE" | "PARTIAL";
    contributions: readonly UnifiedContribution[];
    // La consulta autorizada agrega la proyección visible; no forma parte del documento persistido.
    requestedBy?: Readonly<AnalysisRequester>;
  }>
);

export class InvalidUnifiedReportError extends Error {
  constructor() {
    super("El informe integrado no tiene la forma esperada.");
    this.name = "InvalidUnifiedReportError";
  }
}

/** Valida el documento privado completo y devuelve una copia inmutable, no un DTO de pantalla. */
export function parseUnifiedReport(value: unknown): UnifiedReport {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) throw new InvalidUnifiedReportError();
  return parsed.data;
}

/** Congela disponibilidad al solicitar: solo crea ejecuciones para capacidades disponibles. */
export function createUnifiedReport(value: unknown): UnifiedReport {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) throw new InvalidUnifiedReportError();
  const request = parsed.data;
  const pending = {
    analysisId: request.analysisId,
    status: "PENDING",
    startedAt: null, finishedAt: null, failureCode: null,
    modelName: null, modelVersion: null, preprocessingReference: null, result: null,
  };
  return parseUnifiedReport({
    ...request,
    schemaVersion: "ecg-unified.v1",
    components: {
      ...(request.capabilities.echonext.status === "AVAILABLE" ? { echonext: pending } : {}),
      ...(request.capabilities.e022.status === "AVAILABLE" ? { e022: pending } : {}),
    },
  });
}

function toProgress(execution: EchoNextExecution | E022Execution): ComponentProgress {
  return Object.freeze({
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    failureCode: execution.failureCode,
  });
}

/** Publica solo después de todos los terminales, sin fusionar ni ordenar por puntuación. */
export function publishUnifiedReport(value: unknown): UnifiedReportPublication {
  const report = parseUnifiedReport(value);
  const { echonext, e022 } = report.components;
  const summary: PublicationSummary = {
    analysisId: report.analysisId,
    studyId: report.studyId,
    requestedAt: report.requestedAt,
    capabilities: report.capabilities,
    components: Object.freeze({
      ...(echonext ? { echonext: toProgress(echonext) } : {}),
      ...(e022 ? { e022: toProgress(e022) } : {}),
    }),
  };
  const waiting = Object.values(report.components).some((execution) =>
    execution.status === "PENDING" || execution.status === "PROCESSING");
  if (waiting) return Object.freeze({ ...summary, coverage: "WAITING" });

  const contributions: UnifiedContribution[] = [];
  if (echonext?.status === "COMPLETED") {
    contributions.push(Object.freeze({ component: "echonext", execution: echonext }));
  }
  if (e022?.status === "COMPLETED") {
    contributions.push(Object.freeze({ component: "e022", execution: e022 }));
  }
  if (contributions.length === 0) return Object.freeze({ ...summary, coverage: "NONE" });
  return Object.freeze({
    ...summary,
    coverage: contributions.length === 2 ? "COMPLETE" : "PARTIAL",
    contributions: Object.freeze(contributions),
  });
}
