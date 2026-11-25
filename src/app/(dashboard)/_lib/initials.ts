// Hasta dos iniciales de un nombre o, si es un correo, de su parte local.
export function initialsOf(text: string): string {
  return text
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("es-AR"))
    .join("");
}
