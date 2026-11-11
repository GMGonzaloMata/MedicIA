import { DOCUMENT_TYPES } from "@/modules/users/domain/invitation";

const LABELS = { DNI: "DNI", PASSPORT: "Pasaporte", OTHER: "Otro documento" } as const;

// Opciones del tipo de documento, en el orden del dominio.
export const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((value) => ({ value, label: LABELS[value] }));
