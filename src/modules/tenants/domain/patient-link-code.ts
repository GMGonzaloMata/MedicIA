const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Sin 0, O, 1, I ni L: el código se dicta o se copia a mano y esos símbolos se confunden. Quedan 31, unos 49,5
// bits en 10 caracteres.
export const LINK_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LINK_CODE_LENGTH = 10;
export const LINK_CODE_VALIDITY_DAYS = 7;
// Al quinto fallo el código se anula y la clínica debe generar otro.
export const LINK_CODE_MAX_FAILED_ATTEMPTS = 5;

declare const normalizedLinkCodeBrand: unique symbol;

// Código en mayúsculas y sin separadores: es lo que se resume y se compara.
export type NormalizedLinkCode = string & { readonly [normalizedLinkCodeBrand]: true };

const SEPARATORS = /[\s-]/g;
const GROUP_SIZE = LINK_CODE_LENGTH / 2;

// Devuelve null si el texto no puede ser un código: largo distinto o símbolos que el alfabeto no tiene.
export function normalizeLinkCode(raw: string): NormalizedLinkCode | null {
  const code = raw.replace(SEPARATORS, "").toUpperCase();

  if (code.length !== LINK_CODE_LENGTH || [...code].some((symbol) => !LINK_CODE_ALPHABET.includes(symbol))) {
    return null;
  }

  return code as NormalizedLinkCode;
}

// Formato de pantalla: dos grupos de cinco separados por un guion (`XXXXX-XXXXX`).
export function formatLinkCode(code: NormalizedLinkCode): string {
  return `${code.slice(0, GROUP_SIZE)}-${code.slice(GROUP_SIZE)}`;
}

export function linkCodeExpiresAt(now: Date): Date {
  return new Date(now.getTime() + LINK_CODE_VALIDITY_DAYS * MILLISECONDS_PER_DAY);
}

// Estado guardado en la base. «Vencido» no se guarda: se deduce de `expiresAt` al leer.
export type StoredLinkCodeStatus = "ACTIVE" | "USED" | "REPLACED" | "LOCKED";
export type LinkCodeState = "active" | "expired" | "used" | "replaced" | "locked";

export function deriveLinkCodeState(
  code: { status: StoredLinkCodeStatus; expiresAt: Date },
  now: Date,
): LinkCodeState {
  switch (code.status) {
    case "USED":
      return "used";
    case "REPLACED":
      return "replaced";
    case "LOCKED":
      return "locked";
    case "ACTIVE":
      return code.expiresAt.getTime() > now.getTime() ? "active" : "expired";
  }
}
