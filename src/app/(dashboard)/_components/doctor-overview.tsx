import "server-only";

import Link from "next/link";

import type { DoctorOverviewSummary, RecentDoctorStudy } from "@/modules/studies/domain/doctor-overview";

import { formatUploadedAt, STUDY_MESSAGES } from "../_studies/_lib/study-messages";
import { initialsOf } from "../_lib/initials";
import { ClinicalIcon } from "./clinical-icon";

const countFormat = new Intl.NumberFormat("es-AR");
const panel = "rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]";

// Tonos decorativos para distinguir filas de un vistazo; el nombre del paciente siempre está escrito.
const AVATAR_TONES = [
  "bg-primary/10 text-primary",
  "bg-info-surface text-info",
  "bg-success-surface text-success",
  "bg-warning-surface text-warning",
  "bg-elevated text-muted",
] as const;

function avatarTone(seed: string): string {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function DoctorOverview({ overview }: { overview: DoctorOverviewSummary | null }) {
  return (
    <section aria-labelledby="doctor-overview-title" className="mt-6 flex flex-col gap-6">
      <p role="note" className="flex items-start gap-3 rounded-panel border border-primary/25 bg-primary/5 p-4 text-sm leading-relaxed">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-card bg-primary text-primary-foreground [&_svg]:!size-4">
          <ClinicalIcon name="info" />
        </span>
        <span>
          <strong className="font-semibold">Apoyo clínico con IA.</strong> Los análisis automáticos de los
          electrocardiogramas señalan posibles hallazgos para orientar la revisión. No son un diagnóstico: la
          decisión clínica es siempre del médico.
        </span>
      </p>

      <div className="flex flex-col gap-3">
        <header className="flex flex-col gap-0.5">
          <h2 id="doctor-overview-title" className="text-lg font-bold tracking-tight">
            Resumen clínico
          </h2>
          <p className="text-sm text-muted">Tus asignaciones vigentes en esta clínica.</p>
        </header>
        {overview ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Metric
              icon="patients"
              label="Pacientes asignados"
              value={overview.assignedPatientCount}
              note="Con una asignación vigente a tu nombre"
              bar="bg-primary"
            />
            <Metric
              icon="studies"
              label="Estudios de esos pacientes"
              value={overview.studyCount}
              note="Electrocardiogramas cargados de tus pacientes"
              bar="bg-info"
            />
          </dl>
        ) : (
          <p role="alert" className={`${panel} p-5 text-sm text-muted`}>
            No pudimos cargar el resumen clínico. Probá de nuevo en unos minutos.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-panel border border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-card bg-primary text-primary-foreground [&_svg]:!size-5">
            <ClinicalIcon name="patients" />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-bold tracking-tight">Lista de pacientes</h3>
            <p className="max-w-xl text-sm leading-relaxed text-muted">
              Mirá a todos tus pacientes asignados y entrá a sus estudios.
            </p>
          </div>
        </div>
        <Link href="/patients" prefetch={false} className="clinical-home-action !mt-0 shrink-0 self-start sm:self-auto">
          Ir a Mis pacientes
          <ClinicalIcon name="arrow" />
        </Link>
      </div>

      {overview ? <RecentStudies overview={overview} /> : null}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  bar,
}: {
  icon: "patients" | "studies";
  label: string;
  value: number;
  note: string;
  bar: string;
}) {
  return (
    <div className={`${panel} relative flex flex-col gap-2 overflow-hidden p-5`}>
      <span aria-hidden="true" className="absolute right-5 top-5 grid size-11 place-items-center rounded-card bg-primary/10 text-primary [&_svg]:!size-5">
        <ClinicalIcon name={icon} />
      </span>
      {/* El término y su valor van seguidos: la nota queda después, fuera del par. */}
      <dt className="pr-14 font-label text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="font-sans text-4xl font-extrabold leading-none tracking-tight tabular-nums">
        {countFormat.format(value)}
      </dd>
      <p className="text-sm text-muted">{note}</p>
      <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-1 ${bar}`} />
    </div>
  );
}

function RecentStudies({ overview }: { overview: DoctorOverviewSummary }) {
  const { assignedPatientCount, recentStudies } = overview;

  return (
    <section aria-labelledby="doctor-recent-title" className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h3 id="doctor-recent-title" className="text-lg font-bold tracking-tight">
          Estudios recientes
        </h3>
        {recentStudies.length > 0 ? <p className="text-sm text-muted">Hasta cinco estudios, por fecha de carga.</p> : null}
      </header>
      {recentStudies.length > 0 ? (
        <ol role="list" className={`${panel} flex flex-col divide-y divide-border overflow-hidden`}>
          {recentStudies.map((study) => (
            <RecentStudyRow key={study.id} study={study} />
          ))}
        </ol>
      ) : (
        <p className={`${panel} p-5 text-sm text-muted`}>
          {assignedPatientCount === 0 ? STUDY_MESSAGES.noPatients : "Tus pacientes asignados todavía no tienen estudios cargados."}
        </p>
      )}
    </section>
  );
}

function RecentStudyRow({ study }: { study: RecentDoctorStudy }) {
  const patientName = study.patientName ?? STUDY_MESSAGES.patientWithoutName;

  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/50 sm:gap-4 sm:px-5">
      <span
        aria-hidden="true"
        className={`grid size-10 shrink-0 place-items-center rounded-card font-label text-sm font-bold [&_svg]:!size-5 ${avatarTone(patientName)}`}
      >
        {study.patientName ? initialsOf(study.patientName) : <ClinicalIcon name="patients" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-semibold">{patientName}</p>
          <p className="font-mono text-xs text-muted">Estudio {study.number}</p>
        </div>
        <p className="text-xs text-muted sm:text-sm">
          <span className="hidden sm:inline">Cargado: </span>
          <time dateTime={study.uploadedAt.toISOString()} className="font-medium tabular-nums text-foreground">
            {formatUploadedAt(study.uploadedAt)}
          </time>
        </p>
      </div>
      <Link
        href={`/studies/${study.id}`}
        prefetch={false}
        aria-label={`Ver estudio ${study.number} de ${patientName}`}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-card px-2 text-sm font-semibold text-primary outline-offset-2 transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring sm:px-3"
      >
        <span className="hidden sm:inline">Ver estudio</span>
        <ClinicalIcon name="arrow" />
      </Link>
    </li>
  );
}
