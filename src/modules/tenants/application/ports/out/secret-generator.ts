// Genera y resume los secretos de un solo uso. El resumen (hash) es lo único que se guarda: el valor en claro
// viaja una vez, en el correo o en la pantalla del administrador, y no se puede recuperar.
export interface SecretGenerator {
  // Token de una invitación: 32 bytes aleatorios en base64url.
  generateToken(): string;

  // SHA-256 en hexadecimal. Alcanza para valores con tanta entropía: no necesita sal ni derivación lenta.
  hash(value: string): string;
}
