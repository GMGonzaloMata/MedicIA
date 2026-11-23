// Textos de las pantallas de administración de la clínica y de vinculación. En español rioplatense, sin lenguaje
// técnico, y cada rechazo indica el siguiente paso posible (FR-015). Los rechazos de seguridad usan un mensaje
// único que no revela cuál dato falló.
export const CLINIC_MESSAGES = {
  forbidden: "No tenés permiso para hacer esto. Pedile a quien administra tu clínica que lo haga.",
  unavailable: "No pudimos completar la operación. Probá de nuevo en unos minutos.",
  notFound: "No encontramos lo que buscabas. Volvé a la lista y elegilo de nuevo.",
  invalidInput: "Revisá los datos: hay alguno que falta o no tiene el formato correcto.",

  invitationInvalid:
    "Esta invitación no es válida. Puede haber vencido o haberse usado. Pedile a quien administra la clínica que te envíe una nueva.",
  alreadyMember: "Esa persona ya pertenece a la clínica con esos roles. Si querés darle otro rol, elegí uno que no tenga.",
  memberDeactivated: "Esa persona está desactivada en la clínica. Reactivala desde la lista de personal en lugar de invitarla.",
  mailUnavailable:
    "La invitación quedó creada, pero no pudimos enviar el correo. Probá reenviarla desde la lista de invitaciones pendientes.",
  lastAdmin: "No se puede desactivar al único administrador. Primero sumá otro administrador a la clínica.",

  duplicatePatient: "Ya hay un paciente registrado con ese documento en la clínica.",
  alreadyLinked: "Ese paciente ya vinculó su cuenta, así que no necesita un código nuevo.",
  notADoctor: "Solo se puede asignar un paciente a un médico de la clínica.",
  doctorDeactivated: "Ese médico está desactivado. Reactivalo o elegí otro médico.",
  alreadyAssigned: "Ese paciente ya está asignado a ese médico.",

  linkFailed:
    "No pudimos vincular tu cuenta con esos datos. Revisá el documento y el código, o pedile a tu clínica un código nuevo.",
  tooManyAttempts: "Hiciste demasiados intentos. Esperá unos minutos antes de volver a probar.",
} as const;

export type ClinicMessageKey = keyof typeof CLINIC_MESSAGES;
