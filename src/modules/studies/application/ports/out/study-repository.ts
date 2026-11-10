import type { StudyListItem, StudyRecord, StudyType } from "../../../domain/study";

export interface NewStudy {
  id: string;
  tenantId: string;
  patientId: string;
  uploadedByUserId: string;
  type: StudyType;
  storageKey: string;
}

// Toda consulta de estudios recibe `tenantId`. No hay ninguna que busque por `id` solo: un estudio de otra
// clínica nunca se devuelve ni se modifica.
export interface StudyRepository {
  // Asigna el siguiente número del paciente e inserta el estudio en la misma transacción. Si la inserción
  // falla, el número no se consume. El número nunca se reutiliza, ni siquiera tras eliminar el estudio.
  insertWithNextNumber(study: NewStudy): Promise<StudyRecord>;

  findById(input: { tenantId: string; studyId: string }): Promise<StudyRecord | null>;

  // Del más reciente al más antiguo (número descendente). `page` empieza en 1.
  listByPatient(input: {
    tenantId: string;
    patientId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: StudyListItem[]; totalItems: number }>;

  // Devuelve false si no había un estudio con ese `id` en esa clínica.
  deleteById(input: { tenantId: string; studyId: string }): Promise<boolean>;

  // Tarea de mantenimiento (conciliación de archivos huérfanos): de las claves recibidas, devuelve las que
  // tienen un estudio. No expone datos de ningún estudio.
  findExistingStorageKeys(storageKeys: string[]): Promise<Set<string>>;
}
