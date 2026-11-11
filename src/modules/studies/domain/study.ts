// Tipos del dominio de estudios (specs/006-carga-estudios-ecg/data-model.md). No dependen de Prisma ni de AWS.

export const STUDY_TYPES = ["ECG"] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

// El estado del proceso de análisis vive en cada análisis (008); el estudio solo está «cargado».
export type StudyStatus = "UPLOADED";

export const STUDY_PAGE_SIZE = 20;

// Un estudio tal como lo guarda la base. Nunca lleva el nombre del archivo subido ni las variables.
export interface StudyRecord {
  id: string;
  tenantId: string;
  patientId: string;
  uploadedByUserId: string;
  number: number;
  type: StudyType;
  status: StudyStatus;
  storageKey: string;
  uploadedAt: Date;
}

// Un estudio con quién lo cargó, para el encabezado del visor (specs/007-visor-onda-ecg/data-model.md). Lleva la clave
// del archivo: solo la usa el caso de uso y nunca sale del servidor.
export interface StudyDetail extends StudyRecord {
  uploaderName: string;
  uploadedByPatient: boolean;
}

// Una fila de la lista de estudios de un paciente, con lo necesario para saber quién lo cargó.
export interface StudyListItem {
  id: string;
  number: number;
  type: StudyType;
  status: StudyStatus;
  uploadedAt: Date;
  uploadedByUserId: string;
  uploaderName: string;
  uploadedByPatient: boolean;
}

// Lo que ve quien mira la lista. `canDelete` ya resuelve la regla «solo elimina quien lo cargó».
export type StudyUploader = { kind: "PATIENT" } | { kind: "DOCTOR"; fullName: string };

export interface StudySummary {
  id: string;
  number: number;
  type: StudyType;
  status: StudyStatus;
  uploadedAt: Date;
  uploadedBy: StudyUploader;
  canDelete: boolean;
}

export interface PatientSummary {
  id: string;
  fullName: string | null;
  documentType: "DNI" | "PASSPORT" | "OTHER";
  documentNumber: string;
  studyCount: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// Un `page` ausente o inválido se trata como 1; uno fuera de rango se acota a la última página.
export function normalizePage(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function totalPagesFor(totalItems: number, pageSize: number = STUDY_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, totalItems: number, pageSize: number = STUDY_PAGE_SIZE): number {
  return Math.min(page, totalPagesFor(totalItems, pageSize));
}
