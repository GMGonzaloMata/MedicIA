"use client";

import { useActionState, useEffect } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { resendAccess } from "../_actions/resend-access";

export function ResendAccessButton({ target, onSuccess }: {
  target: { kind: "STAFF"; membershipId: string } | { kind: "PATIENT"; patientId: string };
  onSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState(resendAccess, undefined);
  useEffect(() => {
    if (state?.status === "success") onSuccess?.();
  }, [state, onSuccess]);
  return (
    <div className="flex flex-col items-start gap-2">
      <form action={action}>
        <input type="hidden" name="kind" value={target.kind} />
        {target.kind === "STAFF"
          ? <input type="hidden" name="membershipId" value={target.membershipId} />
          : <input type="hidden" name="patientId" value={target.patientId} />}
        <button type="submit" disabled={pending} className={secondaryButtonClassName}>
          {pending ? "Reenviando…" : "Reenviar acceso"}
        </button>
      </form>
      <div aria-live="polite">
        {state ? <FormMessage tone={state.status === "success" ? "success" : "error"}>{state.message}</FormMessage> : null}
      </div>
    </div>
  );
}
