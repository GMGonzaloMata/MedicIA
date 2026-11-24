import type { PatientSummary } from "./study";

// Lista «Mis pacientes» del médico: búsqueda, filtro y orden sobre todos sus pacientes asignados.

export type PatientListSort = "recent" | "name";
export type PatientListFilter = "all" | "recent" | "without-studies";

// Ventana de «estudios recientes», contada desde el momento de la consulta.
export const RECENT_STUDY_DAYS = 30;
export const MAX_PATIENT_SEARCH_LENGTH = 80;

export interface LastStudy {
  number: number;
  uploadedAt: Date;
}

export interface AssignedPatientSummary extends PatientSummary {
  // El estudio cargado más recientemente, o null si el paciente no tiene estudios.
  lastStudy: LastStudy | null;
}

export interface PatientListCounts {
  total: number;
  // Con al menos un estudio cargado dentro de la ventana reciente.
  recent: number;
  withoutStudies: number;
}

export interface PatientSearch {
  // Texto para buscar en el nombre, sin espacios repetidos.
  name: string;
  // Solo los dígitos y letras del texto, para encontrar «28.412.903» como «28412903».
  document: string;
}

// Un texto vacío, solo espacios o sin caracteres útiles no busca nada.
export function normalizePatientSearch(value: unknown): PatientSearch | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.replace(/\s+/g, " ").trim().slice(0, MAX_PATIENT_SEARCH_LENGTH);
  const document = name.replace(/[^\p{L}\p{N}]/gu, "");

  return name.length > 0 ? { name, document } : null;
}

export function normalizePatientSort(value: unknown): PatientListSort {
  return value === "name" ? "name" : "recent";
}

export function normalizePatientFilter(value: unknown): PatientListFilter {
  return value === "recent" || value === "without-studies" ? value : "all";
}

export function recentStudiesSince(now: Date): Date {
  return new Date(now.getTime() - RECENT_STUDY_DAYS * 24 * 60 * 60 * 1000);
}
