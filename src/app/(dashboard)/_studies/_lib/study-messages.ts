// Textos de las pantallas de estudios. Los motivos de rechazo de un archivo viven en el dominio
// (`describeRejection`): acá solo están los textos propios de la interfaz.

export const STUDY_MESSAGES = {
  uploadUnavailable: "No pudimos guardar el estudio. Probá de nuevo en unos minutos.",
  forbidden: "No tenés acceso para cargar estudios a este paciente.",
  fileTooLarge: "El archivo supera el tamaño máximo de 2 MB.",
  fileMissing: "Elegí un archivo para subir.",
  adminWithoutStudies: "Tu vínculo con la clínica no incluye estudios.",
  typeLabel: "Electrocardiograma",
  statusLabel: "Cargado",
  noPatients: "Todavía no tenés pacientes asignados.",
  patientWithoutName: "Paciente sin nombre",
  patientNoAccess: "No tenés acceso a este paciente.",
  emptyList: "Todavía no hay estudios cargados.",
  listUnavailable: "No pudimos cargar los estudios. Probá de nuevo en unos minutos.",
} as const;

export function savedMessage(number: number): string {
  return `Estudio ${number} guardado.`;
}

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function formatUploadedAt(date: Date): string {
  return dateFormat.format(date);
}
