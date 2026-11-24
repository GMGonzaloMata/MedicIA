import "server-only";

import Link from "next/link";

import type { DoctorOverviewSummary, RecentDoctorStudy } from "@/modules/studies/domain/doctor-overview";

import { formatUploadedAt, STUDY_MESSAGES } from "../_studies/_lib/study-messages";
import { initialsOf } from "../_lib/initials";
import { ClinicalIcon } from "./clinical-icon";

const countFormat = new Intl.NumberFormat("es-AR");

export function DoctorOverview({ overview }: { overview: DoctorOverviewSummary | null }) {
  return (
    <section aria-labelledby="doctor-overview-title" className="clinical-overview">
      <header>
        <h2 id="doctor-overview-title">Resumen clínico</h2>
        <p className="clinical-overview-note">Tus asignaciones vigentes en esta clínica.</p>
      </header>
      {overview ? (
        <>
          <dl className="clinical-overview-metrics">
            <div className="clinical-overview-metric">
              <span aria-hidden="true" className="clinical-metric-icon"><ClinicalIcon name="patients" /></span>
              <dt>Pacientes asignados</dt>
              <dd>{countFormat.format(overview.assignedPatientCount)}</dd>
            </div>
            <div className="clinical-overview-metric">
              <span aria-hidden="true" className="clinical-metric-icon"><ClinicalIcon name="studies" /></span>
              <dt>Estudios de esos pacientes</dt>
              <dd>{countFormat.format(overview.studyCount)}</dd>
            </div>
          </dl>
          <RecentStudies overview={overview} />
        </>
      ) : (
        <p role="alert" className="clinical-overview-empty">
          No pudimos cargar el resumen clínico. Probá de nuevo en unos minutos.
        </p>
      )}
      <Link href="/patients" prefetch={false} className="clinical-overview-link">
        Mis pacientes <ClinicalIcon name="arrow" />
      </Link>
    </section>
  );
}

function RecentStudies({ overview }: { overview: DoctorOverviewSummary }) {
  const { assignedPatientCount, recentStudies } = overview;
  return (
    <section aria-labelledby="doctor-recent-title" className="clinical-overview-recent">
      <header>
        <h3 id="doctor-recent-title">Estudios recientes</h3>
        {recentStudies.length > 0 ? (
          <p className="clinical-overview-note">Hasta cinco estudios, por fecha de carga.</p>
        ) : null}
      </header>
      {recentStudies.length > 0 ? (
        <ol className="clinical-overview-list" role="list">
          {recentStudies.map((study) => <RecentStudyRow key={study.id} study={study} />)}
        </ol>
      ) : (
        <p className="clinical-overview-note">
          {assignedPatientCount === 0 ? STUDY_MESSAGES.noPatients : "Tus pacientes asignados todavía no tienen estudios cargados."}
        </p>
      )}
    </section>
  );
}

function RecentStudyRow({ study }: { study: RecentDoctorStudy }) {
  const patientName = study.patientName ?? STUDY_MESSAGES.patientWithoutName;
  return (
    <li className="clinical-overview-row">
      <span aria-hidden="true" className="clinical-overview-avatar">
        {study.patientName ? initialsOf(study.patientName) : <ClinicalIcon name="patients" />}
      </span>
      <div className="clinical-overview-who">
        <p className="clinical-overview-patient">{patientName}</p>
        <p className="clinical-overview-note">Estudio {study.number}</p>
      </div>
      <time dateTime={study.uploadedAt.toISOString()}>{formatUploadedAt(study.uploadedAt)}</time>
      <Link
        href={`/studies/${study.id}`}
        prefetch={false}
        aria-label={`Ver estudio ${study.number} de ${patientName}`}
        className="clinical-overview-link"
      >
        <span>Ver estudio</span> <ClinicalIcon name="arrow" />
      </Link>
    </li>
  );
}
