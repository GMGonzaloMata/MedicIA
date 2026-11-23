import type { StaffRoles } from "./staff-roles";

export type DeactivationDecision = "ok" | "already-deactivated" | "last-admin";

// Decide si se puede desactivar a un miembro. La clínica nunca queda sin un administrador activo: si el miembro es
// administrador activo y no hay otro, se rechaza. `activeAdminCount` cuenta a todos los administradores activos de la
// clínica, incluido este miembro; el repositorio lo lee con la fila de la clínica bloqueada para que dos
// desactivaciones simultáneas no dejen la clínica sin ninguno.
export function decideDeactivation({
  member,
  activeAdminCount,
}: {
  member: { roles: StaffRoles; status: "ACTIVE" | "DEACTIVATED" };
  activeAdminCount: number;
}): DeactivationDecision {
  if (member.status === "DEACTIVATED") {
    return "already-deactivated";
  }

  if (member.roles.isClinicAdmin && activeAdminCount <= 1) {
    return "last-admin";
  }

  return "ok";
}

export type DoctorAvailability = "NO_ASSIGNMENT" | "AVAILABLE" | "UNAVAILABLE";

// Disponibilidad del médico de un paciente. «No disponible» solo si tiene asignaciones vigentes y todas son de
// médicos desactivados: con al menos un médico activo, el paciente sigue atendido.
export function deriveDoctorAvailability(doctorStatuses: readonly ("ACTIVE" | "DEACTIVATED")[]): DoctorAvailability {
  if (doctorStatuses.length === 0) {
    return "NO_ASSIGNMENT";
  }

  return doctorStatuses.some((status) => status === "ACTIVE") ? "AVAILABLE" : "UNAVAILABLE";
}
