"use client";

import { useActionState, useState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { EMAIL_MAX_LENGTH, PROOF_MAX_LENGTH } from "@/modules/users/application/validation/invitation-form-schemas";
import type { InvitationKind } from "@/modules/users/domain/invitation";

import { createInvitation } from "../_actions/create-invitation";
import { DOCUMENT_TYPE_OPTIONS } from "../_lib/document-types";

const KIND_OPTIONS = [
  { value: "DOCTOR", label: "Médico" },
  { value: "PATIENT", label: "Paciente" },
] as const;

interface InviteFormProps {
  // Los tipos que quien mira puede invitar: el administrador, médicos y pacientes; el médico, solo pacientes.
  kinds: readonly InvitationKind[];
}

function isKind(value: string | undefined): value is InvitationKind {
  return value === "DOCTOR" || value === "PATIENT";
}

// Formulario para invitar. El link nunca se muestra: la plataforma lo envía por correo (FR-035). Quien puede invitar
// un solo tipo no ve el selector, y no hay ninguna asignación manual: el médico queda asignado al aceptar.
export function InviteForm({ kinds }: InviteFormProps) {
  const [state, action] = useActionState(createInvitation, undefined);
  const [chosenKind, setChosenKind] = useState<string | undefined>(undefined);
  const hasSendFailed = state?.status === "send-failed";
  const fallbackKind = kinds[0] ?? "PATIENT";
  const candidate = chosenKind ?? state?.values?.kind;
  const kind = isKind(candidate) && kinds.includes(candidate) ? candidate : fallbackKind;
  const options = KIND_OPTIONS.filter((option) => kinds.includes(option.value));

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      {state?.status === "success" && state.message ? <FormMessage tone="success">{state.message}</FormMessage> : null}
      {(state?.status === "error" || hasSendFailed) && state.message ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}
      {kinds.length > 1 ? (
        <SelectField id="invite-kind" name="kind" label="Tipo de vínculo" options={options} value={kind} onChange={setChosenKind} />
      ) : (
        <>
          <input type="hidden" name="kind" value={kind} />
          <FormField
            id="invite-kind"
            name="kind-label"
            label="Tipo de vínculo"
            defaultValue={kind === "DOCTOR" ? "Médico" : "Paciente"}
            isReadOnly
            isRequired={false}
          />
        </>
      )}
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
      {kind === "DOCTOR" ? (
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
      ) : (
        <>
          <SelectField
            id="invite-document-type"
            name="documentType"
            label="Tipo de documento"
            options={DOCUMENT_TYPE_OPTIONS}
            defaultValue={state?.values?.documentType ?? "DNI"}
            errors={state?.fieldErrors?.documentType}
          />
          <FormField
            id="invite-document-number"
            name="documentNumber"
            label="Número de documento"
            autoComplete="off"
            inputMode="text"
            maxLength={PROOF_MAX_LENGTH}
            hint="La persona tendrá que escribirlo al aceptar la invitación."
            defaultValue={state?.values?.documentNumber}
            errors={state?.fieldErrors?.documentNumber}
          />
        </>
      )}
      <SubmitButton pendingLabel="Enviando…">{hasSendFailed ? "Reintentar" : "Enviar invitación"}</SubmitButton>
    </form>
  );
}
