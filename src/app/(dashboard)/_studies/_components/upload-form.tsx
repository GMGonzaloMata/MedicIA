"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { uploadStudyAction, type UploadStudyState } from "../_actions/upload-study";
import { STUDY_MESSAGES, savedMessage } from "../_lib/study-messages";

interface UploadFormProps {
  // Solo lo envía un médico: el estudio queda a nombre de ese paciente. Un paciente no lo envía.
  patientId?: string;
  maxBytes: number;
}

// Formulario de carga de un estudio. Comprueba el tamaño antes de enviar para no subir un archivo que el
// servidor va a rechazar; el servidor lo vuelve a comprobar. El mensaje va en una región `aria-live`.
export function UploadForm({ patientId, maxBytes }: UploadFormProps) {
  const [state, action] = useActionState<UploadStudyState, FormData>(uploadStudyAction, undefined);
  const [tooLarge, setTooLarge] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-control border border-border bg-card p-4">
      <input type="hidden" name="type" value="ECG" />
      {patientId ? <input type="hidden" name="patientId" value={patientId} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="study-file" className="font-label text-sm font-medium text-foreground">
          Archivo del electrocardiograma
        </label>
        <input
          id="study-file"
          name="file"
          type="file"
          accept=".npz"
          required
          aria-describedby="study-file-hint"
          onChange={(event) => setTooLarge((event.target.files?.[0]?.size ?? 0) > maxBytes)}
          className="min-h-11 w-full rounded-control border border-input-border bg-card px-3 py-2 text-base text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        />
        <p id="study-file-hint" className="text-sm text-muted">
          Un archivo .npz de hasta 2 MB con la onda de 12 derivaciones (2500 muestras) y 7 variables ya
          estandarizadas.
        </p>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {tooLarge ? <FormMessage tone="error">{STUDY_MESSAGES.fileTooLarge}</FormMessage> : null}
        {state?.ok === true ? <FormMessage tone="success">{savedMessage(state.number)}</FormMessage> : null}
        {state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      </div>

      <div>
        <SubmitButton pendingLabel="Validando y guardando…">Subir estudio</SubmitButton>
      </div>
    </form>
  );
}
