"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import type { ClinicActionState } from "../../../clinic/_lib/action-support";
import { acceptInvitationAction } from "../_actions/accept-invitation";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, undefined as ClinicActionState | undefined);

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state?.status === "error" ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <SubmitButton pendingLabel="Aceptando…">Aceptar invitación</SubmitButton>
    </form>
  );
}
