"use client";

import { useActionState, useRef } from "react";

import { primaryButtonClassName, secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { revokeInvitation, type RevokeInvitationState } from "../_actions/revoke-invitation";

// Botón «Revocar» con confirmación en un `<dialog>` nativo: el navegador atrapa el foco, cierra con Escape sin hacer
// nada y devuelve el foco al botón que lo abrió.
export function RevokeInvitationDialog({ invitationId, email }: { invitationId: string; email: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, isPending] = useActionState<RevokeInvitationState, FormData>(revokeInvitation, undefined);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Revocar la invitación a ${email}`}
        className={`${secondaryButtonClassName} min-h-11`}
      >
        Revocar
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`revoke-title-${invitationId}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-control border border-border bg-card p-6 text-foreground backdrop:bg-black/50"
      >
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="invitationId" value={invitationId} />
          <h2 id={`revoke-title-${invitationId}`} className="text-lg font-semibold">
            Revocar invitación
          </h2>
          <p className="text-base">El link enviado a {email} dejará de servir de inmediato.</p>

          <div aria-live="polite">
            {state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={isPending} className={primaryButtonClassName}>
              {isPending ? "Revocando…" : "Revocar invitación"}
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className={secondaryButtonClassName}>
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
