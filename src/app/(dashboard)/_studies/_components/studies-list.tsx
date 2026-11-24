import Link from "next/link";

import type { StudySummary } from "@/modules/studies/domain/study";

import { ClinicalIcon } from "../../_components/clinical-icon";
import { STUDY_MESSAGES, formatUploadedAt } from "../_lib/study-messages";
import { DeleteStudyDialog } from "./delete-study-dialog";

const panelClassName =
  "overflow-hidden rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]";

const numberClassName =
  "inline-grid min-w-9 place-items-center rounded-card bg-primary/10 px-2 py-1 font-label text-sm font-bold tabular-nums text-primary";

const columnHeaderClassName = "px-4 py-3 font-label text-xs font-semibold uppercase tracking-wider text-muted";

function ViewWaveformLink({ study }: { study: StudySummary }) {
  return (
    <Link
      href={`/studies/${study.id}`}
      aria-label={`Ver estudio ${study.number}`}
      className="relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-sm font-semibold text-primary outline-offset-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
    >
      Ver estudio
      <ClinicalIcon name="arrow" />
    </Link>
  );
}

function StatusBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 font-label text-xs font-semibold text-success">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STUDY_MESSAGES.statusLabel}
    </span>
  );
}

function uploaderLabel(study: StudySummary): string {
  return study.uploadedBy.kind === "PATIENT" ? "El propio paciente" : study.uploadedBy.fullName;
}

// Lista de estudios de un paciente: tabla en pantallas anchas y tarjetas apiladas en el móvil. Nunca muestra
// el nombre del archivo subido: el sistema no lo guarda.
export function StudiesList({ studies, emptyHint }: { studies: StudySummary[]; emptyHint?: string }) {
  if (studies.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-card px-5 py-12 text-center">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:!size-6">
          <ClinicalIcon name="studies" />
        </span>
        <p className="font-semibold">{STUDY_MESSAGES.emptyList}</p>
        {emptyHint ? <p className="max-w-sm text-sm text-muted">{emptyHint}</p> : null}
      </div>
    );
  }

  return (
    <>
      <div className={`${panelClassName} hidden md:block`}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Estudios cargados, del más reciente al más antiguo</caption>
          <thead className="bg-elevated/60">
            <tr className="border-b border-border">
              <th scope="col" className={columnHeaderClassName}>Número</th>
              <th scope="col" className={columnHeaderClassName}>Tipo</th>
              <th scope="col" className={columnHeaderClassName}>Fecha y hora</th>
              <th scope="col" className={columnHeaderClassName}>Estado</th>
              <th scope="col" className={columnHeaderClassName}>Cargado por</th>
              <th scope="col" className={columnHeaderClassName}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {studies.map((study) => (
              <tr key={study.id} className="transition-colors hover:bg-elevated/50">
                <th scope="row" className="px-4 py-3">
                  <span className={numberClassName}>{study.number}</span>
                </th>
                <td className="px-4 py-3 font-medium">{STUDY_MESSAGES.typeLabel}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{formatUploadedAt(study.uploadedAt)}</td>
                <td className="px-4 py-3"><StatusBadge /></td>
                <td className="px-4 py-3 text-muted">{uploaderLabel(study)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ViewWaveformLink study={study} />
                    {study.canDelete ? <DeleteStudyDialog studyId={study.id} number={study.number} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={`${panelClassName} flex flex-col divide-y divide-border md:hidden`}>
        {studies.map((study) => (
          <li key={study.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className={numberClassName}>{study.number}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-semibold">Estudio {study.number}</p>
                <p className="text-sm text-muted">
                  <span>{STUDY_MESSAGES.typeLabel}</span> · <span className="tabular-nums">{formatUploadedAt(study.uploadedAt)}</span>
                </p>
                <p className="text-sm text-muted">Cargado por: {uploaderLabel(study)}</p>
              </div>
              <StatusBadge />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ViewWaveformLink study={study} />
              {study.canDelete ? <DeleteStudyDialog studyId={study.id} number={study.number} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
