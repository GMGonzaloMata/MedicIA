"use client";

import { useActionState, useRef } from "react";

import { primaryButtonClassName, secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { deleteStudyAction, type DeleteStudyState } from "../_actions/delete-study";

// Botón «Eliminar» con confirmación en un `<dialog>` nativo: el navegador atrapa el foco, cierra con Escape sin
// hacer nada y devuelve el foco al botón que lo abrió.
export function DeleteStudyDialog({ studyId, number }: { studyId: string; number: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, isPending] = useActionState<DeleteStudyState, FormData>(deleteStudyAction, undefined);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Eliminar el estudio ${number}`}
        className={`${secondaryButtonClassName} min-h-11`}
      >
        Eliminar
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`delete-title-${studyId}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-control border border-border bg-card p-6 text-foreground backdrop:bg-black/50"
      >
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="studyId" value={studyId} />
          <h2 id={`delete-title-${studyId}`} className="text-lg font-semibold">
            Eliminar estudio
          </h2>
          <p className="text-base">Se borrará el estudio {number} y su archivo. No se puede deshacer.</p>

          <div aria-live="polite">
            {state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
            {state?.ok === true && state.warning ? <FormMessage tone="error">{state.warning}</FormMessage> : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={isPending} className={primaryButtonClassName}>
              {isPending ? "Eliminando…" : "Eliminar estudio"}
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
