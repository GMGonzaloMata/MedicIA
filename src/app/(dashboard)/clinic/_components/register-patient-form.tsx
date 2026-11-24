"use client";

import { useActionState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { registerPatientAction } from "../_actions/register-patient";
import type { ClinicActionState } from "../_lib/action-support";
import { LinkCodeNotice } from "./link-code-notice";

export const selectClassName =
  "min-h-11 w-full rounded-control border border-input-border bg-card px-3 text-base text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

// Contenido del modal «Nuevo paciente». El código de vinculación aparece acá, una sola vez.
export function RegisterPatientForm() {
  const [state, action] = useActionState(registerPatientAction, undefined as ClinicActionState | undefined);

  return (
    <div className="flex flex-col gap-4">
      {state?.linkCode ? <LinkCodeNotice code={state.linkCode} /> : null}
      <form action={action} className="flex flex-col gap-4">
        {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="patient-document-type" className="font-label text-sm font-medium text-foreground">
              Tipo de documento
            </label>
            <select id="patient-document-type" name="documentType" className={selectClassName} defaultValue="DNI">
              <option value="DNI">DNI</option>
              <option value="PASSPORT">Pasaporte</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>
          <FormField
            id="patient-document-number"
            name="documentNumber"
            label="Número de documento"
            autoComplete="off"
            maxLength={30}
            hint="El paciente completa su nombre cuando vincula su cuenta."
          />
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <SubmitButton pendingLabel="Registrando…">Registrar paciente</SubmitButton>
        </div>
      </form>
    </div>
  );
}
