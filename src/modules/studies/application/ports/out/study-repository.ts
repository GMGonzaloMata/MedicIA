import type { StudyDetail, StudyListItem, StudyRecord, StudyType } from "../../../domain/study";

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

  // Como `findById`, con quién cargó el estudio (para el encabezado del visor).
  findDetailById(input: { tenantId: string; studyId: string }): Promise<StudyDetail | null>;

  // Del más reciente al más antiguo (número descendente). `page` empieza en 1.
  listByPatient(input: {
    tenantId: string;
    patientId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: StudyListItem[]; totalItems: number }>;

  // Devuelve false si no había un estudio con ese `id` en esa clínica.
  deleteById(input: { tenantId: string; studyId: string }): Promise<boolean>;

  // Excepción a la regla de la clínica: tarea de mantenimiento (conciliación de archivos huérfanos). De las claves
  // recibidas, devuelve las que tienen un estudio, de cualquier clínica. No expone datos de ningún estudio y nunca
  // debe llamarse desde una acción ni desde una pantalla.
  findExistingStorageKeys(storageKeys: string[]): Promise<Set<string>>;
}
