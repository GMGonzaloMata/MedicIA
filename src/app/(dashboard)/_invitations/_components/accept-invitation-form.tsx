"use client";

import Link from "next/link";
import { useActionState } from "react";

import { primaryButtonClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import {
  PROOF_MAX_LENGTH,
  SPECIALTY_MAX_LENGTH,
} from "@/modules/users/application/validation/invitation-form-schemas";

import { acceptInvitation } from "../_actions/accept-invitation";
import { INVITATION_MESSAGES } from "../_lib/invitation-messages";

// Formulario para aceptar la invitación de médico: pide la matrícula que cargó quien invitó y la especialidad. El
// token no viaja en el formulario: la acción lo lee de la cookie.
export function AcceptInvitationForm() {
  const [state, action] = useActionState(acceptInvitation, undefined);

  // Sin nada más que completar: el link se consumió, se invalidó o la persona ya pertenecía.
  if (state?.status === "finished" || state?.status === "already-member") {
    return (
      <div className="flex max-w-md flex-col gap-4">
        <FormMessage tone={state.status === "already-member" ? "success" : "error"}>{state.message}</FormMessage>
        <p>
          <Link href="/" className={primaryButtonClassName}>
            Ir al inicio
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      {state?.status === "error" && state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <p className="text-sm text-muted">{INVITATION_MESSAGES.proofReason}</p>
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
        errors={state?.fieldErrors?.specialty}
      />
      <SubmitButton pendingLabel="Vinculando…">Aceptar invitación</SubmitButton>
    </form>
  );
}
