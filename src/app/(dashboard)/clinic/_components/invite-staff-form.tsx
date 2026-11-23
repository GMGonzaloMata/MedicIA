"use client";

import { useActionState, useState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { inviteStaffAction } from "../_actions/invite-staff";
import type { ClinicActionState } from "../_lib/action-support";

const checkboxClassName = "size-5 rounded-control border border-input-border accent-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

export function InviteStaffForm() {
  const [state, action] = useActionState(inviteStaffAction, undefined as ClinicActionState | undefined);
  const [isDoctor, setIsDoctor] = useState(false);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
      <FormField
        id="invite-email"
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="off"
        inputMode="email"
        maxLength={254}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="font-label text-sm font-medium text-foreground">Rol en la clínica</legend>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="checkbox" name="isClinicAdmin" className={checkboxClassName} />
          Administrador
        </label>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input
            type="checkbox"
            name="isDoctor"
            className={checkboxClassName}
            checked={isDoctor}
            onChange={(event) => setIsDoctor(event.target.checked)}
          />
          Médico
        </label>
      </fieldset>
      {isDoctor ? (
        <>
          <FormField id="invite-specialty" name="specialty" label="Especialidad" maxLength={100} />
          <FormField id="invite-license" name="licenseNumber" label="Matrícula" maxLength={40} />
        </>
      ) : null}
      <SubmitButton pendingLabel="Enviando…">Enviar invitación</SubmitButton>
    </form>
  );
}
