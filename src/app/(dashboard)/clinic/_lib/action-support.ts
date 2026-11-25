import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toClinicAdminActor } from "../../../_lib/clinic-admin-actor";
import { CLINIC_MESSAGES } from "./clinic-messages";

// Estado que devuelven las acciones de administración de la clínica.
export interface ClinicActionState {
  status: "error" | "success";
  message: string;
  // Código de vinculación en claro. Solo viaja en la respuesta de la acción que lo genera: no va en la URL, en una
  // cookie ni en nada que sobreviva a un refresco.
  linkCode?: string;
}

export function errorState(message: string): ClinicActionState {
  return { status: "error", message };
}

export function successState(message: string): ClinicActionState {
  return { status: "success", message };
}

// Puerta única de las acciones de administración: una acción se puede invocar con un POST directo, así que cada
// una comprueba por su cuenta quién es la persona. El `tenantId` sale siempre del contexto, nunca del formulario.
export async function authorizeClinicAdmin(): Promise<{ actor: ClinicAdminActor } | { state: ClinicActionState }> {
  const access = await requireClinicContextForAction();

  if (!access.isAuthorized) {
    if (access.reason === "anonymous") {
      redirect("/sign-in");
    }

    return { state: errorState(CLINIC_MESSAGES.forbidden) };
  }

  const actor = toClinicAdminActor(access.context);

  return actor ? { actor } : { state: errorState(CLINIC_MESSAGES.forbidden) };
}

export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

// Un identificador mal formado se trata igual que uno inexistente o de otra clínica.
export function readId(formData: FormData, name: string): string | null {
  const parsed = z.uuid().safeParse(readText(formData, name));

  return parsed.success ? parsed.data : null;
}

// Los errores inesperados se registran solo por nombre: nunca datos de la persona.
export function unexpectedErrorState(error: unknown): ClinicActionState {
  console.error(`[clínica] error inesperado: ${error instanceof Error ? error.name : "UnknownError"}`);

  return errorState(CLINIC_MESSAGES.unavailable);
}
