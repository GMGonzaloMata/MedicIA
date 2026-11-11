"use client";

import { useActionState } from "react";

import { primaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { requestAnalysisAction, type RequestAnalysisState } from "../../_actions/request-analysis";
import { ANALYSIS_MESSAGES } from "../../_lib/analysis-messages";

interface RequestAnalysisButtonProps {
  studyId: string;
  // Hay un análisis en curso: no se puede pedir otro hasta que termine.
  inProgress: boolean;
}

export function RequestAnalysisButton({ studyId, inProgress }: RequestAnalysisButtonProps) {
  const [state, action] = useActionState<RequestAnalysisState, FormData>(requestAnalysisAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="studyId" value={studyId} />
      <div>
        {inProgress ? (
          <button type="button" disabled className={primaryButtonClassName}>
            {ANALYSIS_MESSAGES.requestInProgress}
          </button>
        ) : (
          <SubmitButton pendingLabel={ANALYSIS_MESSAGES.requestPending}>{ANALYSIS_MESSAGES.requestButton}</SubmitButton>
        )}
      </div>
      {state?.ok === false ? <FormMessage tone="error">{state.message}</FormMessage> : null}
    </form>
  );
}
