"use client";

import { useActionState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { resendInvitationAction } from "../_actions/resend-invitation";
import { revokeInvitationAction } from "../_actions/revoke-invitation";
import type { ClinicActionState } from "../_lib/action-support";

type InvitationAction = (state: ClinicActionState | undefined, formData: FormData) => Promise<ClinicActionState>;

function ActionButton({ invitationId, action, label }: { invitationId: string; action: InvitationAction; label: string }) {
  const [state, formAction, isPending] = useActionState(action, undefined as ClinicActionState | undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button type="submit" disabled={isPending} className={secondaryButtonClassName}>
        {label}
      </button>
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
    </form>
  );
}

export function InvitationRowActions({ invitationId }: { invitationId: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton invitationId={invitationId} action={resendInvitationAction} label="Reenviar" />
      <ActionButton invitationId={invitationId} action={revokeInvitationAction} label="Anular" />
    </div>
  );
}
