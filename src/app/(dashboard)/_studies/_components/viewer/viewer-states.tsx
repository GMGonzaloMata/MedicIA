import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";

import { STUDY_MESSAGES } from "../../_lib/study-messages";

interface BackLink {
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
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Sin acceso</h1>
      <p className="text-base">{STUDY_MESSAGES.studyNoAccess}</p>
      <Back {...back} />
    </>
  );
}

export function WaveformUnavailable({ back }: { back: BackLink }) {
  return (
    <>
      <p role="status" className="text-base">
        {STUDY_MESSAGES.waveformUnavailable}
      </p>
      <Back {...back} />
    </>
  );
}
