import type { InvitationSummary } from "@/modules/users/domain/invitation";

import { INVITATION_MESSAGES } from "../_lib/invitation-messages";
import { RevokeInvitationDialog } from "./revoke-invitation-dialog";

const KIND_LABELS = { DOCTOR: "Médico", PATIENT: "Paciente" } as const;
const TIME_ZONE = "America/Argentina/Buenos_Aires";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: TIME_ZONE }).format(date);
}

interface PendingInvitationsProps {
  invitations: InvitationSummary[];
  // Solo el administrador ve quién generó cada link: quien solo es médico ve únicamente los suyos.
  showCreator: boolean;
}

// Lista de invitaciones pendientes. El estado se dice con texto, no solo con color.
export function PendingInvitations({ invitations, showCreator }: PendingInvitationsProps) {
  if (invitations.length === 0) {
    return <p className="text-base text-muted">{INVITATION_MESSAGES.noPending}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-card p-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="break-all text-base font-medium">{invitation.email}</p>
            <p className="text-sm text-muted">
              {KIND_LABELS[invitation.kind]} · Vence el {formatDate(invitation.expiresAt)}
              {showCreator ? ` · Generada por ${invitation.createdByName}` : ""}
            </p>
            <p className="text-sm font-medium">
              {invitation.sentAt ? INVITATION_MESSAGES.statusSent : INVITATION_MESSAGES.statusSendFailed}
            </p>
          </div>
          <RevokeInvitationDialog invitationId={invitation.id} email={invitation.email} />
        </li>
      ))}
    </ul>
  );
}
