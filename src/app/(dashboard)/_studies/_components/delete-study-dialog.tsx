"use client";

import { useActionState, useRef } from "react";

import {
  compactDangerButtonClassName,
  compactSecondaryButtonClassName,
} from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { ClinicalIcon } from "../../_components/clinical-icon";
import { deleteStudyAction, type DeleteStudyState } from "../_actions/delete-study";

// Acción de fila con el mismo formato que «Ver onda»: sin borde, en rojo y con ícono. El área táctil llega a 44 px.
const rowDeleteClassName =
  "relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-sm font-semibold text-danger outline-offset-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-danger-surface focus-visible:outline-2 focus-visible:outline-ring [&_svg]:!size-4";

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
        className={rowDeleteClassName}
      >
        <ClinicalIcon name="trash" />
        Eliminar
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`delete-title-${studyId}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-panel border border-border bg-card p-6 text-foreground shadow-[0_24px_64px_rgb(0_0_0/0.35)] backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="studyId" value={studyId} />
          <h2 id={`delete-title-${studyId}`} className="text-xl font-bold tracking-tight">
            Eliminar estudio
          </h2>
          <p className="text-sm leading-relaxed text-muted">Se borrará el estudio {number} y su archivo. No se puede deshacer.</p>

          <div aria-live="polite">
            {state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
            {state?.ok === true && state.warning ? <FormMessage tone="error">{state.warning}</FormMessage> : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => dialog.current?.close()} className={compactSecondaryButtonClassName}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className={`${compactDangerButtonClassName} border-danger`}>
              {isPending ? "Eliminando…" : "Eliminar estudio"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
