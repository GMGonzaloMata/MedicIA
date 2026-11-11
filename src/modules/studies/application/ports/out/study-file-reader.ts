import type { EcgStudyData } from "../../../domain/ecg-study";

// Lee el archivo que sube la persona y devuelve la onda y las variables. Solo comprueba la estructura
// (formato, tamaños, tipos y formas); las reglas de contenido las aplica el dominio. Lanza
// `StudyRejectedError` con el motivo, sin repetir valores del archivo.
export interface StudyFileReader {
  read(bytes: Uint8Array): EcgStudyData;
}
