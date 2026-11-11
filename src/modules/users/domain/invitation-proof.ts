import { createHash, timingSafeEqual } from "node:crypto";

// Formatos habituales al escribir un documento o una matrícula: espacios, puntos y guiones.
const IGNORED_CHARACTERS = /[\s.-]/g;

// Deja el documento o la matrícula en un formato único: mayúsculas, sin espacios, puntos ni guiones. Es lo que se
// guarda en el paciente y en la membresía, y lo que se compara al aceptar una invitación. La forma de compatibilidad
// (NFKC) unifica caracteres equivalentes, como los dígitos de ancho completo.
export function normalizeProof(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(IGNORED_CHARACTERS, "");
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Compara el dato guardado con el que escribió la persona, normalizando los dos lados. Compara los hashes con
// `timingSafeEqual` para no filtrar por tiempo cuántos caracteres coinciden. Un dato vacío nunca coincide.
export function proofMatches(expected: string, provided: string): boolean {
  const normalizedExpected = normalizeProof(expected);
  const normalizedProvided = normalizeProof(provided);

  if (normalizedExpected.length === 0 || normalizedProvided.length === 0) {
    return false;
  }

  return timingSafeEqual(digest(normalizedExpected), digest(normalizedProvided));
}
