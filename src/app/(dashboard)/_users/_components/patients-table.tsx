import type { ClinicPatientSummary } from "@/modules/users/application/use-cases/list-clinic-patients";

import { PATIENT_STATUS_LABELS, USER_MESSAGES } from "../_lib/user-messages";

const DOCUMENT_LABELS = { DNI: "DNI", PASSPORT: "Pasaporte", OTHER: "Documento" } as const;

function name(patient: ClinicPatientSummary): string {
  return patient.fullName ?? USER_MESSAGES.noName;
}

function document(patient: ClinicPatientSummary): string {
  return `${DOCUMENT_LABELS[patient.documentType]} ${patient.documentNumber}`;
}

function doctors(patient: ClinicPatientSummary): string {
  if (patient.doctors.length === 0) return USER_MESSAGES.noDoctors;
  return patient.doctors.map((doctor) => `${doctor.fullName}${doctor.isActive ? "" : " (desactivado)"}`).join(", ");
}

function Status({ patient }: { patient: ClinicPatientSummary }) {
  const className = patient.status === "LINKED"
    ? "bg-success-surface text-success"
    : patient.status === "REVOKED"
      ? "bg-danger-surface text-danger"
      : "bg-elevated text-muted";

  return <span className={`inline-flex rounded-control px-2 py-1 text-sm font-semibold ${className}`}>{PATIENT_STATUS_LABELS[patient.status]}</span>;
}

export function PatientsTable({ patients }: { patients: ClinicPatientSummary[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Pacientes de la clínica, por nombre</caption>
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="px-3 py-3 font-medium">Paciente</th>
              <th scope="col" className="px-3 py-3 font-medium">Documento</th>
              <th scope="col" className="px-3 py-3 font-medium">Médicos asignados</th>
              <th scope="col" className="px-3 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.patientId} className="border-b border-border align-top">
                <th scope="row" className="break-words px-3 py-4 font-semibold">{name(patient)}</th>
                <td className="break-all px-3 py-4">{document(patient)}</td>
                <td className="break-words px-3 py-4">{doctors(patient)}</td>
                <td className="px-3 py-4"><Status patient={patient} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {patients.map((patient) => (
          <li key={patient.patientId} className="min-w-0 rounded-card border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-all font-semibold">{name(patient)}</h3>
              <Status patient={patient} />
            </div>
            <p className="mt-2 break-all text-sm text-muted">{document(patient)}</p>
            <p className="mt-2 break-words text-sm"><span className="font-medium">Médicos asignados:</span> {doctors(patient)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
