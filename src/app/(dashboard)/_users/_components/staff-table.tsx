import type { ClinicStaffSummary } from "@/modules/users/application/use-cases/list-clinic-staff";

import { STAFF_STATUS_LABELS } from "../_lib/user-messages";
import { ResendAccessButton } from "./resend-access-button";

function roles(member: ClinicStaffSummary): string {
  if (member.isClinicAdmin && member.isDoctor) return "Administrador y médico";
  if (member.isClinicAdmin) return "Administrador";
  if (member.isDoctor) return "Médico";
  return "Personal";
}

function details(member: ClinicStaffSummary): string | null {
  if (!member.isDoctor) return null;
  return [
    member.specialty ? `Especialidad: ${member.specialty}` : null,
    member.licenseNumber ? `Matrícula: ${member.licenseNumber}` : null,
  ].filter(Boolean).join(" · ");
}

function Status({ member }: { member: ClinicStaffSummary }) {
  const className = member.status === "ACTIVE"
    ? "bg-success-surface text-success"
    : "bg-danger-surface text-danger";

  return <span className={`inline-flex rounded-control px-2 py-1 text-sm font-semibold ${className}`}>{STAFF_STATUS_LABELS[member.status]}</span>;
}

export function StaffTable({ members }: { members: ClinicStaffSummary[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Personal de la clínica, por nombre</caption>
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="px-3 py-3 font-medium">Persona</th>
              <th scope="col" className="px-3 py-3 font-medium">Correo</th>
              <th scope="col" className="px-3 py-3 font-medium">Rol</th>
              <th scope="col" className="px-3 py-3 font-medium">Estado</th>
              <th scope="col" className="px-3 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membershipId} className="border-b border-border align-top">
                <th scope="row" className="break-words px-3 py-4 font-semibold">{member.fullName}</th>
                <td className="break-all px-3 py-4">{member.email}</td>
                <td className="break-words px-3 py-4">
                  <span>{roles(member)}</span>
                  {details(member) ? <span className="block text-muted">{details(member)}</span> : null}
                </td>
                <td className="px-3 py-4"><Status member={member} /></td>
                <td className="px-3 py-4">{member.canResendAccess
                  ? <ResendAccessButton target={{ kind: "STAFF", membershipId: member.membershipId }} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <li key={member.membershipId} className="min-w-0 rounded-card border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-all font-semibold">{member.fullName}</h3>
              <Status member={member} />
            </div>
            <p className="mt-2 break-all text-sm text-muted">{member.email}</p>
            <p className="mt-2 text-sm">{roles(member)}</p>
            {details(member) ? <p className="break-all text-sm text-muted">{details(member)}</p> : null}
            {member.canResendAccess ? <div className="mt-3"><ResendAccessButton target={{ kind: "STAFF", membershipId: member.membershipId }} /></div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
