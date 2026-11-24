"use client";

import { useActionState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import type { ClinicActionState } from "../../clinic/_lib/action-support";
import { linkPatientAction } from "../_actions/link-patient";

const selectClassName =
  "min-h-11 w-full rounded-control border border-input-border bg-card px-3 text-base text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

export function LinkPatientForm() {
  const [state, action] = useActionState(linkPatientAction, undefined as ClinicActionState | undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.status === "error" ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="link-document-type" className="font-label text-sm font-medium text-foreground">
          Tipo de documento
        </label>
        <select id="link-document-type" name="documentType" className={selectClassName} defaultValue="DNI">
          <option value="DNI">DNI</option>
          <option value="PASSPORT">Pasaporte</option>
          <option value="OTHER">Otro</option>
        </select>
      </div>
      <FormField id="link-document-number" name="documentNumber" label="Número de documento" autoComplete="off" maxLength={30} />
      <FormField
        id="link-code"
        name="code"
        label="Código de vinculación"
        autoComplete="off"
        maxLength={20}
        hint="Es el código que te dio tu clínica, con el formato XXXXX-XXXXX. Se usa una sola vez."
      />
      <SubmitButton pendingLabel="Vinculando…">Vincular mi cuenta</SubmitButton>
    </form>
  );
}
