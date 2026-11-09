import { normalizeEmail } from "../../domain/email";
import type { IdentityProvider } from "../ports/out/identity-provider";
import type { UserRepository } from "../ports/out/user-repository";

interface ResetPasswordDependencies {
  identity: IdentityProvider;
  users: UserRepository;
  now: () => Date;
}

// Cambia la contraseña con el código y, solo después de que el proveedor confirmó el cambio,
// invalida todas las sesiones anteriores de la cuenta. Si el proveedor falla no se toca nada.
export function createResetPassword({ identity, users, now }: ResetPasswordDependencies) {
  return async (input: { email: string; code: string; newPassword: string }): Promise<void> => {
    const email = normalizeEmail(input.email);

    await identity.confirmPasswordReset({ email, code: input.code, newPassword: input.newPassword });

    try {
      await users.invalidateSessionsByEmail({ email, now: now() });
    } catch (error) {
      // La contraseña ya cambió pero las sesiones anteriores siguen vigentes: se registra solo el
      // nombre del error (nunca el correo) y se informa para que la persona lo reintente.
      console.error(`[acceso] no se invalidaron las sesiones: ${error instanceof Error ? error.name : "UnknownError"}`);
      throw error;
    }
  };
}
