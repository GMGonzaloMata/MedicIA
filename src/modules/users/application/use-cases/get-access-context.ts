import { ANONYMOUS_CONTEXT, type AccessContext } from "../../domain/access-context";
import { toActiveClinic, type ResolvedSession } from "../../domain/active-relationship";

interface GetAccessContextDependencies {
  resolveCurrentSession: (token: string | null) => Promise<ResolvedSession | null>;
}

// Devuelve quién es la persona y en qué clínica trabaja, revalidando en cada llamada que la
// sesión siga vigente y que el vínculo activo también (membresía activa o paciente vinculado,
// en una clínica activa). Solo expone los datos que las demás funcionalidades necesitan.
export function createGetAccessContext({ resolveCurrentSession }: GetAccessContextDependencies) {
  return async (token: string | null): Promise<AccessContext> => {
    const resolved = await resolveCurrentSession(token);

    if (!resolved) {
      return ANONYMOUS_CONTEXT;
    }

    const clinic = toActiveClinic(resolved.activeRelationship);

    return clinic
      ? { status: "ready", user: resolved.user, clinic }
      : { status: "no-clinic", user: resolved.user };
  };
}
