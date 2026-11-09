import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getUsersModule } from "@/modules/users/composition";
import type { AccessContext } from "@/modules/users/domain/access-context";

import { readSessionToken } from "./session-cookie";

export type ReadyAccessContext = Extract<AccessContext, { status: "ready" }>;

// Resultado para Server Actions y Route Handlers: no redirigen, responden con un rechazo.
export type ActionAccess =
  | { isAuthorized: true; context: ReadyAccessContext }
  | { isAuthorized: false; reason: "anonymous" | "no-clinic" };

// Único punto de entrada para saber quién es la persona y en qué clínica trabaja
// (specs/002-ingreso-sesion/contracts/access-context.md). Revalida la sesión y el vínculo en cada
// solicitud. Se memoiza con `cache` solo dentro de un mismo render: nunca se guarda entre solicitudes,
// ni con `use cache` ni con `use cache: private`, porque una copia haría que una clínica suspendida
// siguiera pareciendo vigente. Va dentro de `<Suspense>`, porque lee la cookie.
export const getAccessContext = cache(async (): Promise<AccessContext> => {
  const token = await readSessionToken();

  return getUsersModule().getAccessContext(token);
});

// Para pantallas: redirige a quien no tiene sesión o no tiene una clínica activa vigente.
export async function requireClinicContext(): Promise<ReadyAccessContext> {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  if (context.status === "no-clinic") {
    redirect("/select-clinic");
  }

  return context;
}

// Para Server Actions y Route Handlers. Cada uno debe llamarla por su cuenta: el `proxy` no los
// protege y una acción se puede invocar con un POST directo.
export async function requireClinicContextForAction(): Promise<ActionAccess> {
  const context = await getAccessContext();

  if (context.status === "ready") {
    return { isAuthorized: true, context };
  }

  return { isAuthorized: false, reason: context.status };
}
