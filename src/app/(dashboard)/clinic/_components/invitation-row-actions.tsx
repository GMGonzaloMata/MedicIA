"use client";

import { useActionState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { resendInvitationAction } from "../_actions/resend-invitation";
import { revokeInvitationAction } from "../_actions/revoke-invitation";
import type { ClinicActionState } from "../_lib/action-support";

type InvitationAction = (state: ClinicActionState | undefined, formData: FormData) => Promise<ClinicActionState>;

function ActionButton({
  invitationId,
  action,
  label,
  describedBy,
}: {
  invitationId: string;
  action: InvitationAction;
  label: string;
  describedBy: string;
}) {
  const [state, formAction, isPending] = useActionState(action, undefined as ClinicActionState | undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button type="submit" disabled={isPending} aria-describedby={describedBy} className={secondaryButtonClassName}>
        {label}
      </button>
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
    </form>
  );
}

// `describedBy` apunta al texto de la fila (el correo): el nombre del botón no cambia y el lector de pantalla sabe
// sobre qué invitación actúa.
export function InvitationRowActions({ invitationId, describedBy }: { invitationId: string; describedBy: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton invitationId={invitationId} action={resendInvitationAction} label="Reenviar" describedBy={describedBy} />
      <ActionButton invitationId={invitationId} action={revokeInvitationAction} label="Anular" describedBy={describedBy} />
    </div>
  );
}
