import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";

import { ClinicalIcon } from "../../../_components/clinical-icon";
import { STUDY_MESSAGES } from "../../_lib/study-messages";

export interface BackLink {
  href: string;
  label: string;
}

function Back({ href, label }: BackLink) {
  return (
    <p>
      <Link href={href} className={`${linkClassName} inline-flex min-h-11 items-center`}>
        {label}
      </Link>
    </p>
  );
}

// Un estudio ajeno, de otra clínica, sin asignación vigente o inexistente se ve siempre igual: sin datos.
export function StudyNoAccess({ back }: { back: BackLink }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-border bg-card p-6 shadow-[0_1px_2px_rgb(15_23_42/0.05)]">
      <h1 className="clinical-page-title">Sin acceso</h1>
      <p className="text-base text-muted">{STUDY_MESSAGES.studyNoAccess}</p>
      <Back {...back} />
    </div>
  );
}

// La pantalla del estudio ya tiene su enlace para volver arriba: entonces se usa sin `back`.
export function WaveformUnavailable({ back }: { back?: BackLink }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-card px-5 py-10 text-center">
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-elevated text-muted [&_svg]:!size-6">
        <ClinicalIcon name="studies" />
      </span>
      <p role="status" className="max-w-md text-base">
        {STUDY_MESSAGES.waveformUnavailable}
      </p>
      {back ? <Back {...back} /> : null}
    </div>
  );
}
