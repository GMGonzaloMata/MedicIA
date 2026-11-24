"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { compactPrimaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { requestAnalysisAction, type RequestAnalysisState } from "../../_actions/request-analysis";
import { ANALYSIS_MESSAGES } from "../../_lib/analysis-messages";

interface RequestAnalysisButtonProps {
  studyId: string;
  // Hay un análisis en curso: no se puede pedir otro hasta que termine.
  inProgress: boolean;
}

// Botón compacto (36 px) con el área táctil ampliada a 44 px por el pseudo-elemento de `compactPrimaryButtonClassName`.
function SubmitAnalysis() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={compactPrimaryButtonClassName}>
      {pending ? ANALYSIS_MESSAGES.requestPending : ANALYSIS_MESSAGES.requestButton}
    </button>
  );
}

export function RequestAnalysisButton({ studyId, inProgress }: RequestAnalysisButtonProps) {
  const [state, action] = useActionState<RequestAnalysisState, FormData>(requestAnalysisAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 sm:items-end">
      <input type="hidden" name="studyId" value={studyId} />
      {inProgress ? (
        <button type="button" disabled className={compactPrimaryButtonClassName}>
          {ANALYSIS_MESSAGES.requestInProgress}
        </button>
      ) : (
        <SubmitAnalysis />
      )}
      {state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
    </form>
  );
}
