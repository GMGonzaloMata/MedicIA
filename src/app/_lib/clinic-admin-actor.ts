import "server-only";

import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";

import type { ReadyAccessContext } from "./access";

// Traduce el contexto de acceso al actor que administra la clínica. Solo lo es el personal con el rol de
// administrador: un médico sin ese rol, un paciente o una persona sin clínica devuelven null. Un administrador
// que además es médico también administra. Vive en la capa `app/` para que el módulo `tenants` no importe
// tipos del módulo de usuarios.
export function toClinicAdminActor({ user, clinic }: ReadyAccessContext): ClinicAdminActor | null {
  const { relationship } = clinic;

  if (relationship.kind !== "STAFF" || !relationship.isClinicAdmin) {
    return null;
  }

  return { tenantId: clinic.tenantId, userId: user.id, membershipId: relationship.membershipId };
}
