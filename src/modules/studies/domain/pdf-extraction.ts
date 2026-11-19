import { z } from "zod";

const LEAD_NAMES = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;
const SAMPLES_PER_LEAD = 5000;
const referenceText = z.string().max(128).refine((value) => value.trim().length > 0);
const measurementSchema = z.strictObject({
  value: z.number().finite().nullable(),
  unit: z.string().max(32).refine((value) => value.trim().length > 0),
}).readonly();
const sampleSchema = z.number().finite().refine((value) => Number.isFinite(Math.fround(value)));
const leadSchema = z.strictObject({
  name: z.enum(LEAD_NAMES),
  samples: z.array(sampleSchema).length(SAMPLES_PER_LEAD).readonly(),
  observed: z.array(z.boolean()).length(SAMPLES_PER_LEAD).readonly(),
}).superRefine((lead, context) => {
  // M1: el productor versionado usa cero como placeholder; la máscara conserva su significado.
  if (lead.samples.some((sample, index) => !lead.observed[index] && sample !== 0)) {
    context.addIssue({ code: "custom", message: "Muestra no observada inválida." });
  }
}).readonly();
const extractionSchema = z.strictObject({
  contract: z.literal("mortara-extraction.v1"),
  extractorVersion: referenceText,
  sourceReference: referenceText,
  samplingHz: z.literal(500),
  unit: z.literal("uV"),
  leads: z.array(leadSchema).length(LEAD_NAMES.length).refine((leads) =>
    new Set(leads.map((lead) => lead.name)).size === LEAD_NAMES.length).readonly(),
  measurements: z.strictObject({
    sex: z.enum(["female", "male"]).nullable(),
    age: measurementSchema,
    // Las claves externas conservan el nombre exacto de mortara-extraction.v1.
    ["ventricular_rate"]: measurementSchema,
    ["atrial_rate"]: measurementSchema,
    ["pr_interval"]: measurementSchema,
    ["qrs_duration"]: measurementSchema,
    ["qt_corrected"]: measurementSchema,
  }).readonly(),
}).readonly();

export type PdfExtraction = z.infer<typeof extractionSchema>;

export class InvalidPdfExtractionError extends Error {
  constructor() {
    super("La extracción del PDF no tiene la forma esperada.");
    this.name = "InvalidPdfExtractionError";
  }
}

/** Valida y copia sin redondear, reordenar, normalizar ni imputar muestras o medidas. */
export function parsePdfExtraction(value: unknown): PdfExtraction {
  const parsed = extractionSchema.safeParse(value);
  if (!parsed.success) throw new InvalidPdfExtractionError();
  return parsed.data;
}
