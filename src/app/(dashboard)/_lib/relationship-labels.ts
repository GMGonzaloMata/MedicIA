type Describable = { kind: "PATIENT" } | { kind: "STAFF"; isClinicAdmin: boolean; isDoctor: boolean };

// Texto del tipo de vínculo con la clínica, para mostrar en la interfaz. Sirve tanto para una
// opción de la lista como para el vínculo de la clínica activa.
export function describeRelationship(relationship: Describable): string {
  if (relationship.kind === "PATIENT") {
    return "Paciente";
  }

  if (relationship.isClinicAdmin && relationship.isDoctor) {
    return "Administrador de la clínica y médico";
  }

  return relationship.isClinicAdmin ? "Administrador de la clínica" : "Médico";
}
