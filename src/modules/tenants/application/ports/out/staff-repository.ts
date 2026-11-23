import type { DoctorProfile } from "../../../domain/doctor-profile";
import type { NormalizedEmail } from "../../../domain/normalized-values";
import type { StaffRoles } from "../../../domain/staff-roles";

export type MembershipStatus = "ACTIVE" | "DEACTIVATED";

export interface StaffMember {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  roles: StaffRoles;
  // Especialidad y matrícula: presentes solo si es médico.
  doctor: DoctorProfile | null;
  status: MembershipStatus;
}

export interface TenantSummary {
  name: string;
  status: "ACTIVE" | "SUSPENDED";
}

// Personal de una clínica. Toda consulta recibe el `tenantId` del actor: nunca devuelve miembros de otra clínica.
export interface StaffRepository {
  // Null si la clínica no existe.
  findTenant(tenantId: string): Promise<TenantSummary | null>;

  // Null si esa persona no tiene vínculo con la clínica (o no tiene cuenta).
  findMemberByEmail(input: { tenantId: string; email: NormalizedEmail }): Promise<StaffMember | null>;

  listMembers(tenantId: string): Promise<StaffMember[]>;

  // Si una matrícula ya la tiene un miembro de la clínica, o una invitación pendiente de otra persona. Sirve para
  // rechazar al invitar y no al aceptar. `exceptEmail` deja afuera la invitación pendiente de ese mismo correo, que
  // la nueva va a reemplazar (reenviar).
  isLicenseTaken(input: { tenantId: string; licenseNumber: string; exceptEmail?: NormalizedEmail }): Promise<boolean>;
}
