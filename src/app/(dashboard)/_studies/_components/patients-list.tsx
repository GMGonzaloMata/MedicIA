import Link from "next/link";

import type { AssignedPatientSummary } from "@/modules/studies/domain/patient-list";

import { ClinicalIcon } from "../../_components/clinical-icon";
import { initialsOf } from "../../_lib/initials";
import { formatUploadedAt, STUDY_MESSAGES } from "../_lib/study-messages";

const DOCUMENT_LABELS = { DNI: "DNI", PASSPORT: "Pasaporte", OTHER: "Documento" } as const;

const cardClassName =
  "relative flex flex-col gap-3 rounded-panel border border-border bg-card p-4 shadow-[0_1px_2px_rgb(15_23_42/0.05)] transition-colors hover:border-primary/40 hover:bg-elevated/40 sm:flex-row sm:items-center sm:gap-4 sm:p-5";

// El nombre es el único enlace de la tarjeta; el pseudo-elemento lo estira para que toda la tarjeta responda al clic.
const cardLinkClassName =
  "rounded-control text-base font-bold tracking-tight text-foreground outline-offset-2 after:absolute after:inset-0 after:rounded-panel after:content-[''] hover:text-primary focus-visible:outline-2 focus-visible:outline-ring";

function patientName(patient: AssignedPatientSummary): string {
  return patient.fullName ?? STUDY_MESSAGES.patientWithoutName;
}

function documentText(patient: AssignedPatientSummary): string {
  return `${DOCUMENT_LABELS[patient.documentType]} ${patient.documentNumber}`;
}

function studyCountText(count: number): string {
  return count === 1 ? "1 estudio registrado" : `${count} estudios registrados`;
}

// Pacientes asignados al médico, como tarjetas. Cada una lleva a la pantalla de estudios del paciente, donde
// también se cargan estudios nuevos.
export function PatientsList({
  patients,
  emptyMessage = STUDY_MESSAGES.noPatients,
  emptyHint = "Cuando la clínica te asigne un paciente, va a aparecer acá con sus estudios.",
}: {
  patients: AssignedPatientSummary[];
  emptyMessage?: string;
  emptyHint?: string;
}) {
  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-card px-5 py-12 text-center">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:!size-6">
          <ClinicalIcon name="patients" />
        </span>
        <p className="font-semibold">{emptyMessage}</p>
        <p className="max-w-sm text-sm text-muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul aria-label="Pacientes asignados, por nombre" className="flex flex-col gap-3">
      {patients.map((patient) => {
        const hasStudies = patient.studyCount > 0;

        return (
          <li key={patient.id} className={cardClassName}>
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-card bg-primary/10 font-label text-sm font-bold text-primary [&_svg]:!size-5"
              >
                {patient.fullName ? initialsOf(patient.fullName) : <ClinicalIcon name="patients" />}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Link href={`/patients/${patient.id}`} className={`${cardLinkClassName} break-words`}>
                    {patientName(patient)}
                  </Link>
                  <span className="text-sm tabular-nums text-muted">
                    <span aria-hidden="true">· </span>
                    {documentText(patient)}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <p className={`flex items-center gap-1.5 [&_svg]:!size-4 ${hasStudies ? "text-foreground" : "italic text-muted"}`}>
                    <span aria-hidden="true" className={hasStudies ? "text-primary" : "text-muted"}>
                      <ClinicalIcon name="studies" />
                    </span>
                    {hasStudies ? studyCountText(patient.studyCount) : "Sin estudios cargados todavía"}
                  </p>
                  {patient.lastStudy ? (
                    <p className="text-muted">
                      <span aria-hidden="true" className="mr-3 hidden sm:inline">
                        ·
                      </span>
                      Último estudio:{" "}
                      <span className="font-semibold text-foreground">Estudio {patient.lastStudy.number}</span> (
                      <time dateTime={patient.lastStudy.uploadedAt.toISOString()} className="tabular-nums">
                        {formatUploadedAt(patient.lastStudy.uploadedAt)}
                      </time>
                      )
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {/* Indicación visual del destino: el enlace real es el nombre, así no hay dos enlaces por paciente. */}
            <span
              aria-hidden="true"
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-control px-3 text-sm font-semibold sm:self-auto ${
                hasStudies ? "text-primary" : "bg-primary text-primary-foreground"
              }`}
            >
              {hasStudies ? "Ver estudios" : "Cargar estudio"}
              <ClinicalIcon name="arrow" />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
