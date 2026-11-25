import "server-only";

import type { PendingInvitation } from "@/modules/tenants/application/use-cases/list-staff";
import type { StaffMember } from "@/modules/tenants/application/ports/out/staff-repository";
import { describeRoles } from "@/modules/tenants/domain/staff-roles";

import { avatarClassName, badgeClassName, initialsOf } from "../_lib/layout-styles";
import { InvitationRowActions } from "./invitation-row-actions";
import { MemberRowActions } from "./member-row-actions";

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });

// Columnas de la tabla de personal en escritorio. En pantallas chicas cada fila se apila.
const memberColumns =
  "lg:grid lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)_9rem] lg:items-center lg:gap-4";

const columnHeaderClassName = "font-label text-xs font-semibold uppercase tracking-wider text-muted";

function Dot() {
  return <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />;
}

export function MembersList({ members }: { members: StaffMember[] }) {
  if (members.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">Todavía no hay personal en la clínica.</p>;
  }

  return (
    <div>
      {/* Encabezado visual de las columnas: cada fila ya dice todo con su propio texto. */}
      <div aria-hidden="true" className={`hidden border-b border-border bg-panel px-5 py-3 ${memberColumns}`}>
        <span className={columnHeaderClassName}>Persona</span>
        <span className={columnHeaderClassName}>Rol</span>
        <span className={columnHeaderClassName}>Especialidad y matrícula</span>
        <span className={columnHeaderClassName}>Estado</span>
        <span className={`${columnHeaderClassName} text-right`}>Acción</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {members.map((member) => {
          const isActive = member.status === "ACTIVE";

          return (
            <li
              key={member.membershipId}
              className={`flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-elevated/50 ${memberColumns} ${
                isActive ? "" : "opacity-80"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className={avatarClassName}>
                  {initialsOf(member.fullName)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <p id={`member-${member.membershipId}`} className="break-words font-semibold">
                    {member.fullName}
                  </p>
                  <p className="break-words text-sm text-muted">{member.email}</p>
                </div>
              </div>
              {/* En pantallas chicas rol, datos de médico y estado van en una fila; en escritorio, cada uno en su columna. */}
              <div className="flex flex-wrap items-center gap-2 lg:contents">
                <div>
                  <span className={badgeClassName(member.roles.isDoctor ? "primary" : "info")}>
                    {describeRoles(member.roles)}
                  </span>
                </div>
                <div className="text-sm">
                  {member.doctor ? (
                    <p className="flex flex-col">
                      <span>{member.doctor.specialty}</span>
                      <span className="text-muted">Matrícula {member.doctor.licenseNumber}</span>
                    </p>
                  ) : (
                    <p className="hidden text-muted lg:block">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">No es médico</span>
                    </p>
                  )}
                </div>
                <div>
                  <span className={badgeClassName(isActive ? "success" : "neutral")}>
                    <Dot />
                    {isActive ? "Activo" : "Desactivado"}
                  </span>
                </div>
              </div>
              <div className="lg:flex lg:justify-end">
                <MemberRowActions
                  membershipId={member.membershipId}
                  status={member.status}
                  describedBy={`member-${member.membershipId}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PendingInvitationsList({ invitations }: { invitations: PendingInvitation[] }) {
  if (invitations.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted">No hay invitaciones pendientes.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {invitations.map((invitation) => {
        const isExpired = invitation.state === "expired";

        return (
          <li
            key={invitation.id}
            className="flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-elevated/50 lg:grid lg:grid-cols-[minmax(0,2.4fr)_minmax(0,2.6fr)_auto] lg:items-center lg:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className={`${avatarClassName} bg-info-surface text-info`}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </span>
              <p id={`invitation-${invitation.id}`} className="min-w-0 break-words font-semibold">
                {invitation.email}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={badgeClassName("info")}>{describeRoles(invitation.roles)}</span>
              <span className={badgeClassName(isExpired ? "danger" : "warning")}>
                <Dot />
                {isExpired
                  ? `Vencida el ${dateFormat.format(invitation.expiresAt)}`
                  : `Vence el ${dateFormat.format(invitation.expiresAt)}`}
              </span>
            </div>
            <InvitationRowActions invitationId={invitation.id} describedBy={`invitation-${invitation.id}`} />
          </li>
        );
      })}
    </ul>
  );
}
