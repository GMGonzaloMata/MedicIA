import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import { normalizeDoctorProfile, type DoctorProfile } from "../../domain/doctor-profile";
import { buildInvitationEmail } from "../../domain/invitation-email";
import { MailDeliveryError } from "../../domain/mail-errors";
import { normalizeEmail } from "../../domain/normalized-values";
import { invitationExpiresAt } from "../../domain/staff-invitation";
import { addsNewRole, hasAnyRole, type StaffRoles } from "../../domain/staff-roles";
import type { InvitationMailer } from "../ports/out/invitation-mailer";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import type { SecretGenerator } from "../ports/out/secret-generator";
import type { StaffRepository } from "../ports/out/staff-repository";

export interface InviteStaffInput {
  actor: ClinicAdminActor;
  email: string;
  roles: StaffRoles;
  // Especialidad y matrícula: obligatorias si `roles.isDoctor`; se ignoran si no (la base exige las dos o ninguna).
  doctor?: DoctorProfile | null;
}

export type InviteStaffResult =
  | { ok: true; invitationId: string }
  | {
      ok: false;
      code: "INVALID_INPUT" | "NOT_FOUND" | "ALREADY_MEMBER" | "MEMBER_DEACTIVATED" | "LICENSE_IN_USE";
    }
  // La invitación quedó creada: el administrador puede reenviarla.
  | { ok: false; code: "MAIL_UNAVAILABLE"; invitationId: string };

interface InviteStaffDependencies {
  staff: StaffRepository;
  invitations: InvitationRepository;
  mailer: InvitationMailer;
  secrets: SecretGenerator;
  now: () => Date;
  // Origen público de la aplicación (APP_BASE_URL), con el que se arma el enlace del correo.
  appBaseUrl: string;
}

// Invita a una persona al personal de la clínica del actor. La clínica sale del actor, nunca de un dato del
// cliente. Si el correo falla, la invitación igual queda creada. El token en claro solo existe acá: viaja en el
// correo y no se guarda ni se registra.
export function createInviteStaff({ staff, invitations, mailer, secrets, now, appBaseUrl }: InviteStaffDependencies) {
  return async ({ actor, email, roles, doctor }: InviteStaffInput): Promise<InviteStaffResult> => {
    const normalizedEmail = normalizeEmail(email);

    if (normalizedEmail === null || !hasAnyRole(roles)) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    // La base exige especialidad y matrícula a todo médico y ninguna a quien no lo es.
    const doctorProfile = roles.isDoctor && doctor ? normalizeDoctorProfile(doctor) : null;

    if (roles.isDoctor && doctorProfile === null) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    // Una clínica suspendida no puede incorporar a nadie.
    const tenant = await staff.findTenant(actor.tenantId);

    if (tenant === null || tenant.status !== "ACTIVE") {
      return { ok: false, code: "NOT_FOUND" };
    }

    const member = await staff.findMemberByEmail({ tenantId: actor.tenantId, email: normalizedEmail });

    if (member?.status === "DEACTIVATED") {
      return { ok: false, code: "MEMBER_DEACTIVATED" };
    }

    if (member && !addsNewRole(member.roles, roles)) {
      return { ok: false, code: "ALREADY_MEMBER" };
    }

    // Una matrícula repetida en la clínica se rechaza ahora y no al aceptar, cuando la persona ya no puede corregirla.
    if (
      doctorProfile &&
      (await staff.isLicenseTaken({
        tenantId: actor.tenantId,
        licenseNumber: doctorProfile.licenseNumber,
        exceptEmail: normalizedEmail,
      }))
    ) {
      return { ok: false, code: "LICENSE_IN_USE" };
    }

    const timestamp = now();
    const token = secrets.generateToken();
    const invitation = await invitations.createReplacingPending({
      tenantId: actor.tenantId,
      email: normalizedEmail,
      roles,
      doctor: doctorProfile,
      tokenHash: secrets.hash(token),
      expiresAt: invitationExpiresAt(timestamp),
      createdByUserId: actor.userId,
      now: timestamp,
    });

    const link = new URL(`/invitation/${token}`, appBaseUrl).toString();

    try {
      await mailer.send({ to: normalizedEmail, ...buildInvitationEmail({ clinicName: tenant.name, roles, link }) });
    } catch (error) {
      if (error instanceof MailDeliveryError) {
        return { ok: false, code: "MAIL_UNAVAILABLE", invitationId: invitation.id };
      }

      throw error;
    }

    return { ok: true, invitationId: invitation.id };
  };
}
