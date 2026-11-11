import type { InvitationActor } from "./invitation-access";

// Reglas de la gestión de usuarios de una clínica (specs/010-gestion-usuarios-clinica/contracts/clinic-user-use-cases.md).
// Son funciones puras: la capa `app/` arma el actor desde el contexto de acceso y los casos de uso las consultan.
// El alta directa reutiliza `canInvite` y `assignsCreator` de la 009, porque sus reglas son las mismas.

export const CLINIC_USERS_PAGE_SIZE = 25;

// Ver las listas, asignar médicos, dar de baja y reactivar: solo el administrador de la clínica.
export function canManageClinicUsers(actor: InvitationActor): boolean {
  return actor.isClinicAdmin;
}

export type StaffDeactivationCheck = "OK" | "CANNOT_DEACTIVATE_SELF" | "LAST_ADMIN";

interface StaffDeactivationInput {
  actorMembershipId: string;
  targetMembershipId: string;
  targetIsClinicAdmin: boolean;
  // Administradores activos de la clínica, sin contar al objetivo. Se cuenta dentro de la transacción que bloquea la clínica.
  otherActiveAdmins: number;
}

// Nadie se desactiva a sí mismo, y no se desactiva a un administrador si no queda otro activo.
export function checkStaffDeactivation({
  actorMembershipId,
  targetMembershipId,
  targetIsClinicAdmin,
  otherActiveAdmins,
}: StaffDeactivationInput): StaffDeactivationCheck {
  if (actorMembershipId === targetMembershipId) {
    return "CANNOT_DEACTIVATE_SELF";
  }

  if (targetIsClinicAdmin && otherActiveAdmins < 1) {
    return "LAST_ADMIN";
  }

  return "OK";
}

interface AssignmentTargets {
  patientStatus: "PENDING" | "LINKED" | "REVOKED";
  membershipStatus: "ACTIVE" | "DEACTIVATED";
  isDoctor: boolean;
}

// Solo se asigna a pacientes vinculados y a integrantes del personal activos con rol de médico.
export function canAssignTo({ patientStatus, membershipStatus, isDoctor }: AssignmentTargets): boolean {
  return patientStatus === "LINKED" && membershipStatus === "ACTIVE" && isDoctor;
}
