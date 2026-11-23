"use client";

import { useActionState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { assignPatientAction } from "../_actions/assign-patient";
import { regenerateLinkCodeAction } from "../_actions/regenerate-link-code";
import type { ClinicActionState } from "../_lib/action-support";
import { LinkCodeNotice } from "./link-code-notice";
import { selectClassName } from "./register-patient-form";

export interface DoctorOption {
  membershipId: string;
  label: string;
}

export function RegenerateCodeForm({ patientId }: { patientId: string }) {
  const [state, action, isPending] = useActionState(regenerateLinkCodeAction, undefined as ClinicActionState | undefined);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <button type="submit" disabled={isPending} className={secondaryButtonClassName}>
        Generar código nuevo
      </button>
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
      {state?.linkCode ? <LinkCodeNotice code={state.linkCode} /> : null}
    </form>
  );
}

export function AssignPatientForm({ patientId, doctors }: { patientId: string; doctors: DoctorOption[] }) {
  const [state, action, isPending] = useActionState(assignPatientAction, undefined as ClinicActionState | undefined);
  const selectId = `assign-${patientId}`;

  if (doctors.length === 0) {
    return <p className="text-sm text-muted">No hay médicos activos para asignar. Invitá a uno desde «Personal».</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <label htmlFor={selectId} className="font-label text-sm font-medium text-foreground">
        Asignar a un médico
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select id={selectId} name="membershipId" className={`${selectClassName} max-w-xs`} defaultValue={doctors[0]?.membershipId}>
          {doctors.map((doctor) => (
            <option key={doctor.membershipId} value={doctor.membershipId}>
              {doctor.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={isPending} className={secondaryButtonClassName}>
          Asignar
        </button>
      </div>
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
    </form>
  );
}
