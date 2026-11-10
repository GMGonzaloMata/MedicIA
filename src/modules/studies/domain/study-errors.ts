// Errores del dominio de estudios. Los mensajes nunca incluyen valores del estudio ni el nombre del
// archivo (specs/006-carga-estudios-ecg/contracts/upload-npz.md): solo el campo, la regla y lo esperado.

export type StudyField = "waveform" | "tabular";

export const REJECTION_CODES = [
  "FILE_MISSING",
  "FILE_TOO_LARGE",
  "NOT_NPZ",
  "UNSUPPORTED_ZIP",
  "EXPANSION_LIMIT",
  "FIELD_MISSING",
  "FIELD_DUPLICATED",
  "FIELD_TYPE",
  "FIELD_SHAPE",
  "FIELD_CORRUPT",
  "VALUE_NOT_FINITE",
  "SEX_INVALID",
  "VALUE_OUT_OF_RANGE",
  "TYPE_UNSUPPORTED",
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

const MAX_FILE_MEGABYTES = 2;

function fieldName(field: StudyField | undefined): string {
  return `«${field ?? "waveform"}»`;
}

// `position` es el número de la variable (empezando en 1), nunca su valor.
export function describeRejection(code: RejectionCode, field?: StudyField, position?: number): string {
  switch (code) {
    case "FILE_MISSING":
      return "Elegí un archivo para subir.";
    case "FILE_TOO_LARGE":
      return `El archivo supera el tamaño máximo de ${MAX_FILE_MEGABYTES} MB.`;
    case "NOT_NPZ":
      return "El archivo no es un .npz válido.";
    case "UNSUPPORTED_ZIP":
      return "El archivo usa una característica de ZIP no admitida.";
    case "EXPANSION_LIMIT":
      return "El contenido del archivo supera el tamaño máximo permitido al descomprimirse.";
    case "FIELD_MISSING":
      return `Falta el campo ${fieldName(field)}.`;
    case "FIELD_DUPLICATED":
      return `El campo ${fieldName(field)} aparece más de una vez.`;
    case "FIELD_TYPE":
      return `El campo ${fieldName(field)} debe ser de tipo float32 o float64.`;
    case "FIELD_SHAPE":
      return field === "tabular"
        ? "El campo «tabular» debe tener 7 valores."
        : "El campo «waveform» debe tener 2500 muestras por 12 derivaciones.";
    case "FIELD_CORRUPT":
      return `El campo ${fieldName(field)} está dañado.`;
    case "VALUE_NOT_FINITE":
      return field === "tabular"
        ? `El campo «tabular» contiene valores no finitos${position ? ` (variable ${position})` : ""}.`
        : "El campo «waveform» contiene valores no finitos.";
    case "SEX_INVALID":
      return "El sexo (primera variable de «tabular») debe ser 0 o 1.";
    case "VALUE_OUT_OF_RANGE":
      return field === "tabular"
        ? `Una variable de «tabular»${position ? ` (variable ${position})` : ""} está fuera del rango esperado. Los valores deben venir estandarizados.`
        : "El campo «waveform» tiene valores fuera del rango esperado. La onda debe venir normalizada.";
    case "TYPE_UNSUPPORTED":
      return "Elegí un tipo de estudio disponible.";
  }
}

// El archivo no cumple los requisitos del estudio: se responde con el motivo y no se guarda nada.
export class StudyRejectedError extends Error {
  readonly code: RejectionCode;
  readonly field: StudyField | undefined;

  constructor(code: RejectionCode, field?: StudyField, position?: number) {
    super(describeRejection(code, field, position));
    this.name = "StudyRejectedError";
    this.code = code;
    this.field = field;
  }
}

// La persona no tiene derecho a esa operación (sin vínculo habilitado o sin acceso al paciente).
export class StudyForbiddenError extends Error {
  constructor() {
    super("No tenés acceso a este estudio.");
    this.name = "StudyForbiddenError";
  }
}

export class StudyNotFoundError extends Error {
  constructor() {
    super("No encontramos el estudio.");
    this.name = "StudyNotFoundError";
  }
}

// Falló el almacenamiento o la base: no se guardó nada y se puede reintentar.
export class StudyUnavailableError extends Error {
  constructor() {
    super("No pudimos completar la operación. Probá de nuevo en unos minutos.");
    this.name = "StudyUnavailableError";
  }
}

// Desde la 008: el estudio tiene un análisis en curso y no se puede eliminar.
export class StudyInUseError extends Error {
  constructor() {
    super("El estudio tiene un análisis en curso y no se puede eliminar todavía.");
    this.name = "StudyInUseError";
  }
}
