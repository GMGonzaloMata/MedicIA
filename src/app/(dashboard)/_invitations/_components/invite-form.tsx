"use client";

import { useActionState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { EMAIL_MAX_LENGTH, PROOF_MAX_LENGTH } from "@/modules/users/application/validation/invitation-form-schemas";

import { createInvitation } from "../_actions/create-invitation";

// Formulario para invitar a un médico. El link nunca se muestra: la plataforma lo envía por correo (FR-035).
export function InviteForm() {
  const [state, action] = useActionState(createInvitation, undefined);
  const hasSendFailed = state?.status === "send-failed";

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      {state?.status === "success" && state.message ? <FormMessage tone="success">{state.message}</FormMessage> : null}
      {(state?.status === "error" || hasSendFailed) && state.message ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}
      {/* Por ahora solo se invita a médicos: el tipo viaja fijo. */}
      <input type="hidden" name="kind" value="DOCTOR" />
      <FormField
        id="invite-kind"
        name="kind-label"
        label="Tipo de vínculo"
        defaultValue="Médico"
        isReadOnly
        isRequired={false}
      />
      <FormField
        id="invite-email"
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="off"
        inputMode="email"
        maxLength={EMAIL_MAX_LENGTH}
        defaultValue={state?.values?.email}
        errors={state?.fieldErrors?.email}
      />
      <FormField
        id="invite-license"
        name="licenseNumber"
        label="Matrícula"
        autoComplete="off"
        maxLength={PROOF_MAX_LENGTH}
        hint="La persona tendrá que escribirla al aceptar la invitación."
        defaultValue={state?.values?.licenseNumber}
        errors={state?.fieldErrors?.licenseNumber}
      />
      <SubmitButton pendingLabel="Enviando…">{hasSendFailed ? "Reintentar" : "Enviar invitación"}</SubmitButton>
    </form>
  );
}
