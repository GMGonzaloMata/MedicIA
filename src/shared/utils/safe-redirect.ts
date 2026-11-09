const FALLBACK_PATH = "/";
const BACKSLASH_CODE = 0x5c;
const DELETE_CODE = 0x7f;
const LAST_CONTROL_CODE = 0x1f;

function hasBackslashOrControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code === BACKSLASH_CODE || code === DELETE_CODE || code <= LAST_CONTROL_CODE) {
      return true;
    }
  }

  return false;
}

// Devuelve el destino solo si es una ruta interna de la plataforma; si no, la raíz.
// Evita redirigir a sitios externos con `//host`, `/\host`, esquemas o variantes codificadas,
// y los saltos de línea que permitirían inyectar encabezados.
export function getSafeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return FALLBACK_PATH;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return FALLBACK_PATH;
  }

  if (decoded.startsWith("//")) {
    return FALLBACK_PATH;
  }

  if (hasBackslashOrControlCharacter(value) || hasBackslashOrControlCharacter(decoded)) {
    return FALLBACK_PATH;
  }

  return value;
}
