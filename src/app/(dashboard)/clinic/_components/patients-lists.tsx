import "server-only";

import type { ClinicPatientSummary } from "@/modules/tenants/application/use-cases/list-clinic-patients";
import type { LinkCodeState } from "@/modules/tenants/domain/patient-link-code";

import { avatarClassName, badgeClassName, initialsOf, type BadgeTone } from "../_lib/layout-styles";
import { ModalDialog } from "./modal-dialog";
import { AssignPatientForm, EndAssignmentForm, RegenerateCodeForm, type DoctorOption } from "./patient-row-actions";

const DOCUMENT_LABELS = { DNI: "DNI", PASSPORT: "Pasaporte", OTHER: "Documento" } as const;

const STATUS_LABELS = {
  PENDING: "Pendiente de vincular",
  LINKED: "Cuenta vinculada",
  REVOKED: "Vínculo revocado",
} as const;

const STATUS_TONES: Record<keyof typeof STATUS_LABELS, BadgeTone> = {
  PENDING: "warning",
  LINKED: "success",
  REVOKED: "danger",
};

// Estados del último código. Se dicen con palabras, no solo con color.
const CODE_LABELS: Record<LinkCodeState, string> = {
  active: "Código vigente",
  expired: "Código vencido",
  used: "Código usado",
  replaced: "Código reemplazado",
  locked: "Código bloqueado por intentos fallidos",
};

// Columnas de la tabla en escritorio. En pantallas chicas cada fila se apila.
const patientColumns =
  "lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1.7fr)_minmax(0,auto)] lg:items-center lg:gap-4";

const columnHeaderClassName = "font-label text-xs font-semibold uppercase tracking-wider text-muted";

function documentText(patient: ClinicPatientSummary): string {
  return `${DOCUMENT_LABELS[patient.documentType]} ${patient.documentNumber}`;
}

export function ClinicPatientsList({
  patients,
  doctors,
  emptyMessage,
}: {
  patients: ClinicPatientSummary[];
  doctors: DoctorOption[];
  emptyMessage: string;
}) {
  if (patients.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      {/* Encabezado visual de las columnas: cada fila ya dice todo con su propio texto. */}
      <div aria-hidden="true" className={`hidden border-b border-border bg-panel px-5 py-3 ${patientColumns}`}>
        <span className={columnHeaderClassName}>Paciente</span>
        <span className={columnHeaderClassName}>Estado</span>
        <span className={columnHeaderClassName}>Médico</span>
        <span className={`${columnHeaderClassName} text-right`}>Acciones</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {patients.map((patient) => {
          const rowId = `patient-${patient.id}`;

          return (
            <li key={patient.id} className={`flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-elevated/50 ${patientColumns}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className={avatarClassName}>
                  {patient.fullName ? initialsOf(patient.fullName) : patient.documentNumber.slice(-2)}
                </span>
                <div id={rowId} className="flex min-w-0 flex-col">
                  <p className="break-words font-semibold">{patient.fullName ?? documentText(patient)}</p>
                  {patient.fullName ? <p className="text-sm text-muted">{documentText(patient)}</p> : null}
                </div>
              </div>
              <div>
                {/* Un solo texto («Pendiente de vincular · Código vigente») dividido en insignia y detalle. */}
                <p className="flex flex-col items-start gap-1">
                  <span className={badgeClassName(STATUS_TONES[patient.status])}>
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
                    {STATUS_LABELS[patient.status]}
                  </span>
                  {patient.status === "PENDING" && patient.linkCodeState ? (
                    <span className="pl-1 text-xs text-muted">
                      <span className="sr-only"> · </span>
                      {CODE_LABELS[patient.linkCodeState]}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                {patient.assignments.length === 0 ? <p className="text-muted">Sin médico asignado</p> : null}
                {/* Un médico desactivado conserva la asignación vigente: se dice con texto y se puede terminar o reasignar. */}
                {patient.assignments.map((assignment) => (
                  <div key={assignment.assignmentId} className="flex flex-col items-start gap-1.5">
                    <p className="font-medium">
                      <span className="sr-only">Médico: </span>
                      {assignment.doctorName}
                    </p>
                    {assignment.doctorStatus === "DEACTIVATED" ? (
                      <p className="text-xs font-medium text-warning">Desactivado: el paciente no tiene quién lo atienda</p>
                    ) : null}
                    <EndAssignmentForm assignmentId={assignment.assignmentId} describedBy={rowId} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <ModalDialog
                  variant="secondary"
                  triggerLabel="Asignar médico"
                  triggerDescribedBy={rowId}
                  title="Asignar médico"
                  description={`${documentText(patient)}. Con una asignación vigente, el médico ve al paciente y sus estudios.`}
                >
                  <AssignPatientForm patientId={patient.id} doctors={doctors} />
                </ModalDialog>
                {patient.status === "PENDING" ? (
                  <ModalDialog
                    variant="secondary"
                    triggerLabel="Generar código nuevo"
                    triggerDescribedBy={rowId}
                    title="Generar código nuevo"
                    description={`${documentText(patient)}. El código anterior deja de servir. El nuevo se muestra una sola vez y vence a los 7 días.`}
                  >
                    <RegenerateCodeForm patientId={patient.id} />
                  </ModalDialog>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
