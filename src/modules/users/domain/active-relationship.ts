import type { ActiveClinic, AccessUser } from "./access-context";
import type { SessionTimes } from "./session-policy";

// Vínculo activo de una sesión tal como está guardado, con los estados que deciden si sigue vigente.
export type StoredRelationship =
  | {
      kind: "STAFF";
      membershipId: string;
      isClinicAdmin: boolean;
      isDoctor: boolean;
      membershipStatus: "ACTIVE" | "DEACTIVATED";
      tenantId: string;
      tenantName: string;
      tenantStatus: "ACTIVE" | "SUSPENDED";
    }
  | {
      kind: "PATIENT";
      patientId: string;
      patientStatus: "PENDING" | "LINKED" | "REVOKED";
      tenantId: string;
      tenantName: string;
      tenantStatus: "ACTIVE" | "SUSPENDED";
    };

export interface StoredSession extends SessionTimes {
  id: string;
}

// Lo que devuelve el repositorio en una sola consulta: la sesión, la cuenta y el vínculo activo.
export interface ResolvedSession {
  session: StoredSession;
  user: AccessUser;
  sessionsValidFrom: Date;
  activeRelationship: StoredRelationship | null;
}

// Una membresía o un paciente siguen vigentes solo si su estado y el de la clínica lo permiten.
// Que el vínculo exista no alcanza: un paciente revocado conserva su cuenta (spec 001).
export function toActiveClinic(relationship: StoredRelationship | null): ActiveClinic | null {
  if (relationship === null || relationship.tenantStatus !== "ACTIVE") {
    return null;
  }

  if (relationship.kind === "STAFF") {
    if (relationship.membershipStatus !== "ACTIVE") {
      return null;
    }

    return {
      tenantId: relationship.tenantId,
      tenantName: relationship.tenantName,
      relationship: {
        kind: "STAFF",
        membershipId: relationship.membershipId,
        isClinicAdmin: relationship.isClinicAdmin,
        isDoctor: relationship.isDoctor,
      },
    };
  }

  if (relationship.patientStatus !== "LINKED") {
    return null;
  }

  return {
    tenantId: relationship.tenantId,
    tenantName: relationship.tenantName,
    relationship: { kind: "PATIENT", patientId: relationship.patientId },
  };
}
