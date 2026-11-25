import { normalizeEmail } from "../../domain/normalized-values";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import type { SecretGenerator } from "../ports/out/secret-generator";

export interface AcceptStaffInvitationInput {
  // Token en claro tal como llegó en el enlace.
  token: string;
  // La persona sale de la sesión, nunca del formulario. Su correo ya lo verificó el proveedor de identidad.
  user: { id: string; email: string };
}

export type AcceptStaffInvitationResult =
  | { ok: true; tenantId: string; membershipId: string }
  // Un único resultado para inexistente, vencida, revocada, usada, dirigida a otro correo o miembro desactivado.
  | { ok: false; code: "INVALID_INVITATION" };

interface AcceptStaffInvitationDependencies {
  invitations: InvitationRepository;
  secrets: SecretGenerator;
  now: () => Date;
}

// Acepta una invitación con la cuenta que ya tiene la persona. Es una de las dos lecturas sin clínica previa de la
// funcionalidad: la clínica sale de la invitación encontrada por el hash del token, nunca de un dato del cliente.
export function createAcceptStaffInvitation({ invitations, secrets, now }: AcceptStaffInvitationDependencies) {
  return async ({ token, user }: AcceptStaffInvitationInput): Promise<AcceptStaffInvitationResult> => {
    const email = normalizeEmail(user.email);

    if (email === null || token.trim() === "") {
      return { ok: false, code: "INVALID_INVITATION" };
    }

    const result = await invitations.accept({
      tokenHash: secrets.hash(token.trim()),
      user: { id: user.id, email },
      now: now(),
    });

    if (result.kind === "rejected") {
      return { ok: false, code: "INVALID_INVITATION" };
    }

    return { ok: true, tenantId: result.tenantId, membershipId: result.membershipId };
  };
}
