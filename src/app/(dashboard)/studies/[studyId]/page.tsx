import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { linkClassName } from "@/components/form/button-styles";
import { getStudiesModule } from "@/modules/studies/composition";
import { StudyForbiddenError, StudyNotFoundError } from "@/modules/studies/domain/study-errors";
import type { StudyActor } from "@/modules/studies/domain/study-access";

import { requireClinicContext } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { StudyViewer } from "../../_studies/_components/viewer/study-viewer";
import { StudyNoAccess, WaveformUnavailable } from "../../_studies/_components/viewer/viewer-states";
import { WaveformSummary } from "../../_studies/_components/viewer/waveform-summary";
import { STUDY_MESSAGES, formatUploadedAt } from "../../_studies/_lib/study-messages";

export const metadata: Metadata = { title: "Estudio de ECG" };

type StudyPageProps = PageProps<"/studies/[studyId]">;

export default function StudyPage({ params }: StudyPageProps) {
  // Leer la sesión y los parámetros ocurre en cada solicitud, así que va dentro de Suspense.
  return (
    <Suspense
      fallback={
        <p role="status" className="text-muted">
          {STUDY_MESSAGES.studyLoading}
        </p>
      }
    >
      <StudyContent params={params} />
    </Suspense>
  );
}

function listLink(actor: StudyActor, patientId?: string) {
  return actor.kind === "PATIENT"
    ? { href: "/studies", label: "Volver a mis estudios" }
    : patientId
      ? { href: `/patients/${patientId}`, label: "Volver a los estudios del paciente" }
      : { href: "/patients", label: "Volver a mis pacientes" };
}

async function StudyContent({ params }: { params: StudyPageProps["params"] }) {
  const actor = toStudyActor(await requireClinicContext());

  if (!actor) {
    return <p className="text-base">{STUDY_MESSAGES.adminWithoutStudies}</p>;
  }

  const parsedId = z.uuid().safeParse((await params).studyId);

  // Un identificador mal formado, ajeno, de otra clínica, sin asignación vigente o inexistente se ve igual: sin datos.
  if (!parsedId.success) {
    return <StudyNoAccess back={listLink(actor)} />;
  }

  let result;

  try {
    result = await getStudiesModule().getStudyWaveform({ actor, studyId: parsedId.data });
  } catch (error) {
    if (error instanceof StudyForbiddenError || error instanceof StudyNotFoundError) {
      return <StudyNoAccess back={listLink(actor)} />;
    }
    throw error;
  }

  const { study } = result;
  const back = listLink(actor, study.patientId);

  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Estudio {study.number}</h1>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-base sm:grid-cols-[auto_1fr]">
        {actor.kind === "DOCTOR" ? (
          <>
            <dt className="font-medium">Paciente</dt>
            <dd>{study.patientName ?? STUDY_MESSAGES.patientWithoutName}</dd>
          </>
        ) : null}
        <dt className="font-medium">Fecha y hora de carga</dt>
        <dd>{formatUploadedAt(study.uploadedAt)}</dd>
        <dt className="font-medium">Cargado por</dt>
        <dd>{study.uploadedBy.kind === "PATIENT" ? "El propio paciente" : study.uploadedBy.fullName}</dd>
      </dl>

      {result.status === "READY" ? (
        <>
          <StudyViewer leads={result.leads} />
          <WaveformSummary />
          <p>
            <Link href={back.href} className={`${linkClassName} inline-flex min-h-11 items-center`}>
              {back.label}
            </Link>
          </p>
        </>
      ) : (
        <WaveformUnavailable back={back} />
      )}
    </>
  );
}
