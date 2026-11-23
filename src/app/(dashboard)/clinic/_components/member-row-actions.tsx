"use client";

import { useActionState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormMessage } from "@/components/form/form-message";

import { deactivateMemberAction } from "../_actions/deactivate-member";
import { reactivateMemberAction } from "../_actions/reactivate-member";
import type { ClinicActionState } from "../_lib/action-support";

// Desactivar no borra nada: la persona pierde el acceso y su historial se conserva. El estado de la fila se dice con
// texto («Activo» o «Desactivado»); el botón solo ofrece la acción contraria.
export function MemberRowActions({
  membershipId,
  status,
  describedBy,
}: {
  membershipId: string;
  status: "ACTIVE" | "DEACTIVATED";
  describedBy: string;
}) {
  const isActive = status === "ACTIVE";
  const [state, action, isPending] = useActionState(
    isActive ? deactivateMemberAction : reactivateMemberAction,
    undefined as ClinicActionState | undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <button type="submit" disabled={isPending} aria-describedby={describedBy} className={`${secondaryButtonClassName} self-start`}>
        {isActive ? "Desactivar" : "Reactivar"}
      </button>
      {state ? <FormMessage tone={state.status}>{state.message}</FormMessage> : null}
    </form>
  );
}
