"use client";

import { useActionState } from "react";

import { primaryButtonClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import {
  PROOF_MAX_LENGTH,
  SPECIALTY_MAX_LENGTH,
} from "@/modules/users/application/validation/invitation-form-schemas";
import type { InvitationKind } from "@/modules/users/domain/invitation";

import { acceptInvitation } from "../_actions/accept-invitation";
import { dismissInvitation } from "../_actions/dismiss-invitation";
import { DOCUMENT_TYPE_OPTIONS } from "../_lib/document-types";
import { INVITATION_MESSAGES } from "../_lib/invitation-messages";

// Formulario para aceptar la invitación: al médico le pide la matrícula que cargó quien invitó y su especialidad; al
// paciente, su documento. El token no viaja en el formulario: la acción lo lee de la cookie.
export function AcceptInvitationForm({ kind }: { kind: InvitationKind }) {
  const [state, action] = useActionState(acceptInvitation, undefined);

  // Sin nada más que completar: el link se consumió, se invalidó o la persona ya pertenecía.
  if (state?.status === "finished" || state?.status === "already-member") {
    return (
      <div className="flex max-w-md flex-col gap-4">
        <FormMessage tone={state.status === "already-member" ? "success" : "error"}>{state.message}</FormMessage>
        <form action={dismissInvitation}>
          <button type="submit" className={primaryButtonClassName}>
            Ir al inicio
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      {state?.status === "error" && state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <p className="text-sm text-muted">{INVITATION_MESSAGES.proofReason}</p>
      {kind === "DOCTOR" ? (
        <>
          <FormField
            id="accept-license"
            name="licenseNumber"
            label="Matrícula"
            autoComplete="off"
            maxLength={PROOF_MAX_LENGTH}
            errors={state?.fieldErrors?.licenseNumber}
          />
          <FormField
            id="accept-specialty"
            name="specialty"
            label="Especialidad"
            autoComplete="off"
            maxLength={SPECIALTY_MAX_LENGTH}
            defaultValue={state?.values?.specialty}
            errors={state?.fieldErrors?.specialty}
          />
        </>
      ) : (
        <>
          <SelectField
            id="accept-document-type"
            name="documentType"
            label="Tipo de documento"
            options={DOCUMENT_TYPE_OPTIONS}
            defaultValue={state?.values?.documentType ?? "DNI"}
            errors={state?.fieldErrors?.documentType}
          />
          <FormField
            id="accept-document-number"
            name="documentNumber"
            label="Número de documento"
            autoComplete="off"
            maxLength={PROOF_MAX_LENGTH}
            errors={state?.fieldErrors?.documentNumber}
          />
        </>
      )}
      <SubmitButton pendingLabel="Vinculando…">Aceptar invitación</SubmitButton>
    </form>
  );
}
