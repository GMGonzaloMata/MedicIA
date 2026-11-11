import { z } from "zod";

// Los 12 hallazgos de EchoNext-Mini, en el orden fijo del contrato de inferencia
// (specs/005-echonext-mini-sagemaker/contracts/inference-api.md). El último es el compuesto.
export const FINDING_KEYS = [
  "lvef_lte_45",
  "lvwt_gte_13",
  "aortic_stenosis",
  "aortic_regurgitation",
  "mitral_regurgitation",
  "tricuspid_regurgitation",
  "pulmonary_regurgitation",
  "rv_systolic_dysfunction",
  "pericardial_effusion",
  "pasp_gte_45",
  "tr_max_gte_32",
  "shd",
] as const;

export type FindingKey = (typeof FINDING_KEYS)[number];

export type Probabilities = Record<FindingKey, number>;

const probabilitySchema = z.number().min(0).max(1);

const probabilitiesSchema = z.strictObject(
  Object.fromEntries(FINDING_KEYS.map((key) => [key, probabilitySchema])) as Record<
    FindingKey,
    typeof probabilitySchema
  >,
);

// Las probabilidades no son válidas. El mensaje no repite ningún valor.
export class InvalidProbabilitiesError extends Error {
  constructor() {
    super("Las probabilidades no tienen la forma esperada: 12 valores entre 0 y 1.");
    this.name = "InvalidProbabilitiesError";
  }
}

export function parseProbabilities(value: unknown): Probabilities {
  const result = probabilitiesSchema.safeParse(value);

  if (!result.success) {
    throw new InvalidProbabilitiesError();
  }

  return result.data;
}

export function orderProbabilities(probabilities: Probabilities): { key: FindingKey; value: number }[] {
  return FINDING_KEYS.map((key) => ({ key, value: probabilities[key] }));
}
