// Datos que la base exige a todo médico (`staff_memberships_doctor_fields`, spec 001 FR-012): especialidad y
// matrícula profesional. Los carga el administrador al invitarlo.
export interface DoctorProfile {
  specialty: string;
  licenseNumber: string;
}

export const MAX_SPECIALTY_LENGTH = 100;
export const MAX_LICENSE_NUMBER_LENGTH = 40;

// Quita los espacios de los bordes y exige que ninguno de los dos datos quede vacío ni pase el largo máximo.
// Devuelve null si alguno no es válido.
export function normalizeDoctorProfile(raw: DoctorProfile): DoctorProfile | null {
  const specialty = raw.specialty.trim();
  const licenseNumber = raw.licenseNumber.trim();

  if (specialty === "" || specialty.length > MAX_SPECIALTY_LENGTH) {
    return null;
  }

  if (licenseNumber === "" || licenseNumber.length > MAX_LICENSE_NUMBER_LENGTH) {
    return null;
  }

  return { specialty, licenseNumber };
}
