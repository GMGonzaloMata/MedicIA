"use client";

import { useActionState, useState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { FULL_NAME_MAX_LENGTH } from "@/modules/users/application/validation/account-form-schemas";
import { EMAIL_MAX_LENGTH, PROOF_MAX_LENGTH, SPECIALTY_MAX_LENGTH } from "@/modules/users/application/validation/invitation-form-schemas";
import type { InvitationKind } from "@/modules/users/domain/invitation";

import { DOCUMENT_TYPE_OPTIONS } from "@/app/(dashboard)/_invitations/_lib/document-types";
import { enrollMember } from "../_actions/enroll-member";
import { ResendAccessButton } from "./resend-access-button";

const KIND_OPTIONS = [
  { value: "DOCTOR", label: "Médico" },
  { value: "PATIENT", label: "Paciente" },
];

export function EnrollForm({ kinds }: { kinds: readonly InvitationKind[] }) {
  const [state, action] = useActionState(enrollMember, undefined);
  const [chosenKind, setChosenKind] = useState<string | undefined>();
  const [retriedTargetId, setRetriedTargetId] = useState<string | null>(null);
  const retryTargetId = state?.retryTarget
    ? state.retryTarget.kind === "STAFF" ? state.retryTarget.membershipId : state.retryTarget.patientId
    : null;
  const retrySucceeded = state?.status === "mail-failed" && retryTargetId === retriedTargetId;
  const kind = chosenKind === "DOCTOR" && kinds.includes("DOCTOR") ? "DOCTOR" :
    chosenKind === "PATIENT" ? "PATIENT" :
    state?.values?.kind === "DOCTOR" && kinds.includes("DOCTOR") ? "DOCTOR" : kinds[0] ?? "PATIENT";

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div aria-live="polite">
        {retrySucceeded ? <FormMessage tone="success">Enviamos nuevamente el acceso.</FormMessage> :
          state?.message ? <FormMessage tone={state.status === "success" ? "success" : "error"}>{state.message}</FormMessage> : null}
      </div>
      {state?.status === "mail-failed" && state.retryTarget && !retrySucceeded ? (
        <ResendAccessButton target={state.retryTarget} onSuccess={() => setRetriedTargetId(retryTargetId)} />
      ) : (
        <form action={action} className="flex flex-col gap-4">
          {kinds.length > 1 ? (
            <SelectField id="enroll-kind" name="kind" label="Tipo de persona"
              options={KIND_OPTIONS.filter((option) => kinds.includes(option.value as InvitationKind))}
              value={kind} onChange={setChosenKind} />
          ) : <input type="hidden" name="kind" value="PATIENT" />}
          <FormField id="enroll-email" name="email" label="Correo electrónico" type="email"
            autoComplete="off" inputMode="email" maxLength={EMAIL_MAX_LENGTH}
            defaultValue={state?.values?.email} errors={state?.fieldErrors?.email} />
          <FormField id="enroll-name" name="fullName" label="Nombre completo" autoComplete="off"
            maxLength={FULL_NAME_MAX_LENGTH} defaultValue={state?.values?.fullName}
            errors={state?.fieldErrors?.fullName} />
          {kind === "DOCTOR" ? (
            <>
              <FormField id="enroll-license" name="licenseNumber" label="Matrícula" autoComplete="off"
                maxLength={PROOF_MAX_LENGTH} defaultValue={state?.values?.licenseNumber}
                errors={state?.fieldErrors?.licenseNumber} />
              <FormField id="enroll-specialty" name="specialty" label="Especialidad" autoComplete="off"
                maxLength={SPECIALTY_MAX_LENGTH} defaultValue={state?.values?.specialty}
                errors={state?.fieldErrors?.specialty} />
            </>
          ) : (
            <>
              <SelectField id="enroll-document-type" name="documentType" label="Tipo de documento"
                options={DOCUMENT_TYPE_OPTIONS} defaultValue={state?.values?.documentType ?? "DNI"}
                errors={state?.fieldErrors?.documentType} />
              <FormField id="enroll-document" name="documentNumber" label="Número de documento"
                autoComplete="off" maxLength={PROOF_MAX_LENGTH} defaultValue={state?.values?.documentNumber}
                errors={state?.fieldErrors?.documentNumber} />
            </>
          )}
          <SubmitButton pendingLabel="Dando de alta…">Dar de alta</SubmitButton>
        </form>
      )}
    </div>
  );
}
