import type { StudySummary } from "@/modules/studies/domain/study";

import { STUDY_MESSAGES, formatUploadedAt } from "../_lib/study-messages";
import { DeleteStudyDialog } from "./delete-study-dialog";

function uploaderLabel(study: StudySummary): string {
  return study.uploadedBy.kind === "PATIENT" ? "El propio paciente" : study.uploadedBy.fullName;
}

// Lista de estudios de un paciente: tabla en pantallas anchas y tarjetas apiladas en el móvil. Nunca muestra
// el nombre del archivo subido: el sistema no lo guarda.
export function StudiesList({ studies }: { studies: StudySummary[] }) {
  if (studies.length === 0) {
    return <p className="text-base text-muted">{STUDY_MESSAGES.emptyList}</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">Estudios cargados, del más reciente al más antiguo</caption>
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              <th scope="col" className="px-3 py-2 font-medium">Número</th>
              <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
              <th scope="col" className="px-3 py-2 font-medium">Fecha y hora</th>
              <th scope="col" className="px-3 py-2 font-medium">Estado</th>
              <th scope="col" className="px-3 py-2 font-medium">Cargado por</th>
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {studies.map((study) => (
              <tr key={study.id} className="border-b border-border">
                <th scope="row" className="px-3 py-3 font-semibold">{study.number}</th>
                <td className="px-3 py-3">{STUDY_MESSAGES.typeLabel}</td>
                <td className="px-3 py-3">{formatUploadedAt(study.uploadedAt)}</td>
                <td className="px-3 py-3">{STUDY_MESSAGES.statusLabel}</td>
                <td className="px-3 py-3">{uploaderLabel(study)}</td>
                <td className="px-3 py-3 text-right">
                  {study.canDelete ? <DeleteStudyDialog studyId={study.id} number={study.number} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {studies.map((study) => (
          <li key={study.id} className="flex flex-col gap-1 rounded-control border border-border bg-card p-4">
            <p className="text-lg font-semibold">Estudio {study.number}</p>
            <p>{STUDY_MESSAGES.typeLabel}</p>
            <p className="text-sm text-muted">{formatUploadedAt(study.uploadedAt)}</p>
            <p className="text-sm">
              {STUDY_MESSAGES.statusLabel} · {uploaderLabel(study)}
            </p>
            {study.canDelete ? (
              <div className="pt-2">
                <DeleteStudyDialog studyId={study.id} number={study.number} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
