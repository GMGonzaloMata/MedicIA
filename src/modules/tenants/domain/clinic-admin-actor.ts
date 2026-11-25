// Quien administra una clínica en una solicitud. Los casos de uso de administración lo exigen: la clínica sale de
// acá, que viene del contexto autenticado, y nunca de un dato enviado por el cliente.
export interface ClinicAdminActor {
  tenantId: string;
  userId: string;
  membershipId: string;
}
