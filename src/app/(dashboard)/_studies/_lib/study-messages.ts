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
  deleteForbidden: "No podés eliminar este estudio.",
  deleteNotFound: "No encontramos el estudio.",
  deleteUnavailable: "No pudimos eliminar el estudio. Probá de nuevo en unos minutos.",
  fileLeftBehind: "El estudio se eliminó, pero su archivo quedó pendiente de limpieza.",
  emptyList: "Todavía no hay estudios cargados.",
  listUnavailable: "No pudimos cargar los estudios. Probá de nuevo en unos minutos.",
  studyNoAccess: "No tenés acceso a este estudio.",
  waveformUnavailable: "La onda de este estudio no está disponible. Probá de nuevo más tarde o cargalo otra vez.",
  studyLoading: "Cargando estudio…",
  studyError: "No pudimos mostrar el estudio.",
  waveformNote:
    "Señal normalizada, sin unidades de milivolts. Cada derivación tiene su propia escala. Es una visualización de la señal, no una interpretación.",
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
