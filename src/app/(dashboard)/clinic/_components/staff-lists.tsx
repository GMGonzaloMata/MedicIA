import "server-only";

import type { PendingInvitation } from "@/modules/tenants/application/use-cases/list-staff";
import type { StaffMember } from "@/modules/tenants/application/ports/out/staff-repository";
import { describeRoles } from "@/modules/tenants/domain/staff-roles";

import { InvitationRowActions } from "./invitation-row-actions";
import { MemberRowActions } from "./member-row-actions";

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });

export function MembersList({ members }: { members: StaffMember[] }) {
  if (members.length === 0) {
    return <p className="text-muted">Todavía no hay personal en la clínica.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
      {members.map((member) => (
        <li key={member.membershipId} className="flex flex-col gap-1 px-4 py-3">
          <p className="font-semibold">{member.fullName}</p>
          <p className="text-sm text-muted">{member.email}</p>
          <p className="text-sm">
            {describeRoles(member.roles)}
            {member.doctor ? ` · ${member.doctor.specialty} · Matrícula ${member.doctor.licenseNumber}` : ""}
            {" · "}
            {member.status === "ACTIVE" ? "Activo" : "Desactivado"}
          </p>
          <MemberRowActions membershipId={member.membershipId} status={member.status} />
        </li>
      ))}
    </ul>
  );
}

export function PendingInvitationsList({ invitations }: { invitations: PendingInvitation[] }) {
  if (invitations.length === 0) {
    return <p className="text-muted">No hay invitaciones pendientes.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="flex flex-col gap-2 px-4 py-3">
          <p className="font-semibold">{invitation.email}</p>
          <p className="text-sm">
            {describeRoles(invitation.roles)}
            {" · "}
            {invitation.state === "expired"
              ? `Vencida el ${dateFormat.format(invitation.expiresAt)}`
              : `Vence el ${dateFormat.format(invitation.expiresAt)}`}
          </p>
          <InvitationRowActions invitationId={invitation.id} />
        </li>
      ))}
    </ul>
  );
}
