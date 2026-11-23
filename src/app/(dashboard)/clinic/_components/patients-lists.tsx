import "server-only";

import type { ClinicPatientSummary } from "@/modules/tenants/application/use-cases/list-clinic-patients";
import type { LinkCodeState } from "@/modules/tenants/domain/patient-link-code";

import { AssignPatientForm, RegenerateCodeForm, type DoctorOption } from "./patient-row-actions";

const DOCUMENT_LABELS = { DNI: "DNI", PASSPORT: "Pasaporte", OTHER: "Documento" } as const;

const STATUS_LABELS = {
  PENDING: "Pendiente de vincular",
  LINKED: "Cuenta vinculada",
  REVOKED: "Vínculo revocado",
} as const;

// Estados del último código. Se dicen con palabras, no solo con color.
const CODE_LABELS: Record<LinkCodeState, string> = {
  active: "Código vigente",
  expired: "Código vencido: generá uno nuevo",
  used: "Código usado",
  replaced: "Código reemplazado",
  locked: "Código bloqueado por intentos fallidos: generá uno nuevo",
};

export function ClinicPatientsList({
  patients,
  doctors,
}: {
  patients: ClinicPatientSummary[];
  doctors: DoctorOption[];
}) {
  if (patients.length === 0) {
    return <p className="text-muted">Todavía no hay pacientes registrados en la clínica.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
      {patients.map((patient) => (
        <li key={patient.id} className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">
              {DOCUMENT_LABELS[patient.documentType]} {patient.documentNumber}
              {patient.fullName ? ` · ${patient.fullName}` : ""}
            </p>
            <p className="text-sm">
              {STATUS_LABELS[patient.status]}
              {patient.status === "PENDING" && patient.linkCodeState ? ` · ${CODE_LABELS[patient.linkCodeState]}` : ""}
            </p>
            <p className="text-sm text-muted">
              {patient.assignments.length === 0
                ? "Sin médico asignado"
                : `Médico: ${patient.assignments
                    .map((assignment) =>
                      assignment.doctorStatus === "DEACTIVATED" ? `${assignment.doctorName} (desactivado)` : assignment.doctorName,
                    )
                    .join(", ")}`}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            <AssignPatientForm patientId={patient.id} doctors={doctors} />
            {patient.status === "PENDING" ? <RegenerateCodeForm patientId={patient.id} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
