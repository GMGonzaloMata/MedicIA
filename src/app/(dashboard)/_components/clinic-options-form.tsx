"use client";

import { useActionState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { selectClinic } from "../_actions/select-clinic";

export interface ClinicOption {
  // `STAFF:<id>` o `PATIENT:<id>`. Es el identificador del vínculo, no de la clínica.
  value: string;
  tenantName: string;
  description: string;
  isActive: boolean;
}

// Lista de clínicas disponibles: cada una es un botón de envío que activa ese vínculo.
export function ClinicOptionsForm({ options }: { options: ClinicOption[] }) {
  const [state, action, isPending] = useActionState(selectClinic, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <ul className="flex flex-col gap-3">
        {options.map((option) => (
          <li key={option.value}>
            <button
              type="submit"
              name="relationship"
              value={option.value}
              disabled={isPending}
              aria-current={option.isActive ? "true" : undefined}
              className={`${secondaryButtonClassName} w-full flex-col items-start gap-0.5 py-3 text-left`}
            >
              <span>{option.tenantName}</span>
              <span className="text-sm font-normal text-muted">
                {option.description}
                {option.isActive ? " · Clínica actual" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
