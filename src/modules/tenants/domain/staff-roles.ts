// Roles de una persona del personal de una clínica. Pueden combinarse: un administrador puede ser también médico.
export interface StaffRoles {
  isClinicAdmin: boolean;
  isDoctor: boolean;
}

// Un vínculo del personal sin ningún rol no tiene sentido: la invitación exige al menos uno.
export function hasAnyRole(roles: StaffRoles): boolean {
  return roles.isClinicAdmin || roles.isDoctor;
}

// Texto que se muestra a la persona, en pantallas y en el correo de la invitación.
export function describeRoles(roles: StaffRoles): string {
  if (roles.isClinicAdmin && roles.isDoctor) {
    return "médico y administrador";
  }

  return roles.isDoctor ? "médico" : "administrador";
}

// Quien ya es miembro puede recibir una invitación solo si le suma un rol que no tiene.
export function addsNewRole(existing: StaffRoles, requested: StaffRoles): boolean {
  return (requested.isClinicAdmin && !existing.isClinicAdmin) || (requested.isDoctor && !existing.isDoctor);
}

export function mergeRoles(existing: StaffRoles, requested: StaffRoles): StaffRoles {
  return {
    isClinicAdmin: existing.isClinicAdmin || requested.isClinicAdmin,
    isDoctor: existing.isDoctor || requested.isDoctor,
  };
}
