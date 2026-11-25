"use client";

import { useActionState } from "react";

import { compactDangerButtonClassName, primaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { assignPatientAction } from "../_actions/assign-patient";
import { endAssignmentAction } from "../_actions/end-assignment";
import { regenerateLinkCodeAction } from "../_actions/regenerate-link-code";
import type { ClinicActionState } from "../_lib/action-support";
import { LinkCodeNotice } from "./link-code-notice";
import { selectClassName } from "./register-patient-form";

export interface DoctorOption {
  membershipId: string;
  label: string;
}

// Contenido del modal «Generar código nuevo». El código se muestra una sola vez: al generarlo, el botón desaparece.
export function RegenerateCodeForm({ patientId }: { patientId: string }) {
  const [state, action, isPending] = useActionState(regenerateLinkCodeAction, undefined as ClinicActionState | undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
      {state?.linkCode ? (
        <LinkCodeNotice code={state.linkCode} />
      ) : (
        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" disabled={isPending} className={primaryButtonClassName}>
            {isPending ? "Generando…" : "Generar código"}
          </button>
        </div>
      )}
    </form>
  );
}

// Terminar no borra la asignación: queda en el historial con su fecha de fin.
export function EndAssignmentForm({ assignmentId, describedBy }: { assignmentId: string; describedBy: string }) {
  const [state, action, isPending] = useActionState(endAssignmentAction, undefined as ClinicActionState | undefined);

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button type="submit" disabled={isPending} aria-describedby={describedBy} className={compactDangerButtonClassName}>
        Terminar asignación
      </button>
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
    </form>
  );
}

// Contenido del modal «Asignar médico». Solo se ofrecen médicos activos de la clínica.
export function AssignPatientForm({ patientId, doctors }: { patientId: string; doctors: DoctorOption[] }) {
  const [state, action, isPending] = useActionState(assignPatientAction, undefined as ClinicActionState | undefined);
  const selectId = `assign-${patientId}`;

  if (doctors.length === 0) {
    return <p className="text-sm text-muted">No hay médicos activos para asignar. Invitá a uno desde «Personal».</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
      <input type="hidden" name="patientId" value={patientId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="font-label text-sm font-medium text-foreground">
          Médico
        </label>
        <select id={selectId} name="membershipId" className={selectClassName} defaultValue={doctors[0]?.membershipId}>
          {doctors.map((doctor) => (
            <option key={doctor.membershipId} value={doctor.membershipId}>
              {doctor.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={isPending} className={primaryButtonClassName}>
          Asignar
        </button>
      </div>
    </form>
  );
}
