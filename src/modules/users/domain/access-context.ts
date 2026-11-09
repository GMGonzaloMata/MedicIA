// Quién es la persona y en qué clínica trabaja en una solicitud (specs/002-ingreso-sesion/contracts/access-context.md).
// El `tenantId` de cualquier operación sale siempre de acá, nunca de un dato enviado por el cliente.

export interface AccessUser {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
}

export type ClinicRelationship =
  | { kind: "STAFF"; membershipId: string; isClinicAdmin: boolean; isDoctor: boolean }
  | { kind: "PATIENT"; patientId: string };

export interface ActiveClinic {
  tenantId: string;
  tenantName: string;
  relationship: ClinicRelationship;
}

export type AccessContext =
  | { status: "anonymous" }
  | { status: "no-clinic"; user: AccessUser }
  | { status: "ready"; user: AccessUser; clinic: ActiveClinic };

export const ANONYMOUS_CONTEXT: AccessContext = { status: "anonymous" };
