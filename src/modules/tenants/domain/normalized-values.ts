// Valores ya normalizados. Toda comparación de correos y documentos pasa por acá, para que no se comparen
// valores crudos: «Ana@Clinica.com » y «ana@clinica.com» son el mismo correo, y «12.345.678» y «12345678»
// el mismo documento.

declare const normalizedEmailBrand: unique symbol;
declare const normalizedDocumentBrand: unique symbol;

export type NormalizedEmail = string & { readonly [normalizedEmailBrand]: true };
export type NormalizedDocument = string & { readonly [normalizedDocumentBrand]: true };

export const DOCUMENT_TYPES = ["DNI", "PASSPORT", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENT_SEPARATORS = /[\s.\-]/g;
const DOCUMENT_PATTERN = /^[A-Z0-9]{4,20}$/;
const MAX_EMAIL_LENGTH = 254;

// Devuelve null si el texto no tiene forma de correo. La base guarda los correos en minúsculas.
export function normalizeEmail(raw: string): NormalizedEmail | null {
  const email = raw.trim().toLowerCase();

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email as NormalizedEmail;
}

// Quita espacios, puntos y guiones y pasa a mayúsculas. Devuelve null si no queda un documento plausible
// (de 4 a 20 letras o números).
export function normalizeDocument(raw: string): NormalizedDocument | null {
  const document = raw.replace(DOCUMENT_SEPARATORS, "").toUpperCase();

  return DOCUMENT_PATTERN.test(document) ? (document as NormalizedDocument) : null;
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}
