import "server-only";

import { createHmac } from "node:crypto";

// Cognito exige este valor en cada llamada cuando el cliente de la aplicación tiene secreto:
// HMAC-SHA256 en base 64 del nombre de usuario más el ID del cliente, con el secreto como clave.
export function computeSecretHash({
  username,
  clientId,
  clientSecret,
}: {
  username: string;
  clientId: string;
  clientSecret: string;
}): string {
  return createHmac("sha256", clientSecret).update(`${username}${clientId}`).digest("base64");
}
