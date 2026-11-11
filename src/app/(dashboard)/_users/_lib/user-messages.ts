export const STAFF_STATUS_LABELS = {
  ACTIVE: "Activo",
  DEACTIVATED: "Desactivado",
} as const;

export const PATIENT_STATUS_LABELS = {
  LINKED: "Vinculado",
  REVOKED: "Revocado",
  PENDING: "Pendiente",
} as const;

export const USER_MESSAGES = {
  forbidden: "No tenés permiso para gestionar los usuarios de esta clínica.",
  emptyStaff: "Todavía no hay personal en esta clínica. Podés invitar a una persona para empezar.",
  emptyPatients: "Todavía no hay pacientes en esta clínica. Podés invitar a una persona para empezar.",
  emptyPage: "No hay personas en esta página. Volvé a la primera página.",
  noName: "Sin nombre",
  noDoctors: "Sin médicos asignados",
  forbiddenAction: "No tenés permiso para hacer esta acción.",
  notFound: "No encontramos a esa persona en tu clínica.",
  alreadyInState: "Esta persona ya se encuentra en ese estado.",
  cannotDeactivateSelf: "No podés desactivarte a vos mismo.",
  lastAdmin: "No se puede desactivar al único administrador de la clínica.",
  alreadyAssigned: "Ese médico ya está asignado a este paciente.",
  patientNotLinked: "El paciente debe estar vinculado para recibir una asignación.",
  notActiveDoctor: "Elegí un médico activo de esta clínica.",
  accessSent: "Enviamos nuevamente el acceso.",
  accessMailFailed: "No pudimos enviar el correo de acceso. Podés volver a intentarlo.",
  accessNotEligible: "Esta persona ya ingresó a MedicIA.",
  unavailable: "El servicio no está disponible en este momento. Intentá de nuevo más tarde.",
  enrolled: "La persona quedó vinculada a la clínica.",
  alreadyMember: "La persona ya pertenece a esta clínica.",
  invalidInput: "Revisá los datos ingresados.",
  assigned: "El médico quedó asignado al paciente.",
  unassigned: "La asignación del médico terminó.",
  changed: "El estado se actualizó.",
  alreadyStaff: "Esa cuenta ya pertenece al personal de la clínica.",
  alreadyPatient: "Esa cuenta ya es paciente de la clínica.",
  membershipDeactivated: "La membresía de esta persona está desactivada.",
  roleChangeNotSupported: "No se puede cambiar el rol de esta persona desde el alta.",
  documentInUse: "Ese documento ya está registrado en la clínica.",
  licenseInUse: "Esa matrícula ya está registrada en la clínica.",
} as const;
