import "server-only";

import { resolveStudyActor, type StudyActor } from "@/modules/studies/domain/study-access";

import type { ReadyAccessContext } from "./access";

// Traduce el contexto de acceso al actor de los estudios. Solo actúan el paciente y el médico: un
// administrador que no es médico devuelve null. Vive en la capa `app/` para que el módulo de estudios
// no importe tipos del módulo de usuarios.
export function toStudyActor({ user, clinic }: ReadyAccessContext): StudyActor | null {
  return resolveStudyActor({
    tenantId: clinic.tenantId,
    userId: user.id,
    relationship:
      clinic.relationship.kind === "PATIENT"
        ? { kind: "PATIENT", patientId: clinic.relationship.patientId }
        : {
            kind: "STAFF",
            membershipId: clinic.relationship.membershipId,
            isDoctor: clinic.relationship.isDoctor,
            isClinicAdmin: clinic.relationship.isClinicAdmin,
          },
  });
}
