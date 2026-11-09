import type { AccessUser } from "../../../domain/access-context";

export interface UserRepository {
  // Crea la cuenta propia la primera vez que una identidad verificada ingresa, o la reutiliza.
  // Falla con `AccountConflictError` si el correo ya pertenece a otro `subject`.
  // Al crear, `sessionsValidFrom` toma `now` para que la sesión del primer ingreso no nazca anterior.
  upsertFromIdentity(input: {
    subject: string;
    email: string;
    fullName: string;
    now: Date;
  }): Promise<AccessUser>;

  // Invalida todas las sesiones anteriores a `now`. No hace nada si el correo no tiene cuenta propia.
  invalidateSessionsByEmail(input: { email: string; now: Date }): Promise<void>;
}
