import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { z } from "zod";

import { getStudiesModule } from "@/modules/studies/composition";
import { isStudyAccessError } from "@/modules/studies/domain/study-errors";
import type { StudyActor } from "@/modules/studies/domain/study-access";

import { requireClinicContext } from "../../../_lib/access";
import { ClinicalIcon } from "../../_components/clinical-icon";
import { toStudyActor } from "../../../_lib/study-actor";
import { AnalysisSection } from "../../_studies/_components/analysis/analysis-section";
import { IntegratedAnalysisSection } from "../../_studies/_components/analysis/integrated-analysis-section";
import { PdfStudyViewer } from "../../_studies/_components/viewer/pdf-study-viewer";
import { StudyViewer } from "../../_studies/_components/viewer/study-viewer";
import { StudyNoAccess, WaveformUnavailable } from "../../_studies/_components/viewer/viewer-states";
import { WaveformSummary } from "../../_studies/_components/viewer/waveform-summary";
import { ANALYSIS_MESSAGES } from "../../_studies/_lib/analysis-messages";
import { STUDY_MESSAGES, formatUploadedAt } from "../../_studies/_lib/study-messages";

export const metadata: Metadata = { title: "Estudio de ECG" };

type StudyPageProps = PageProps<"/studies/[studyId]">;

export default function StudyPage({ params, searchParams }: StudyPageProps) {
  // Leer la sesión y los parámetros ocurre en cada solicitud, así que va dentro de Suspense.
  return (
    <Suspense
      fallback={
        <p role="status" className="text-muted">
          {STUDY_MESSAGES.studyLoading}
        </p>
      }
    >
      <StudyContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const cardClassName = "rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]";

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-label text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function listLink(actor: StudyActor, patientId?: string) {
  return actor.kind === "PATIENT"
    ? { href: "/studies", label: "Volver a mis estudios" }
    : patientId
      ? { href: `/patients/${patientId}`, label: "Volver a los estudios del paciente" }
      : { href: "/patients", label: "Volver a mis pacientes" };
}

async function StudyContent({
  params,
  searchParams,
}: {
  params: StudyPageProps["params"];
  searchParams: StudyPageProps["searchParams"];
}) {
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
    if (isStudyAccessError(error)) {
      return <StudyNoAccess back={listLink(actor)} />;
    }
    throw error;
  }

  const { study } = result;
  const back = listLink(actor, study.patientId);
  // Un `analysisId` mal formado se ignora y se muestra el análisis más reciente.
  const requestedAnalysis = z.uuid().safeParse((await searchParams).analysisId);
  // La fuente persistida separa PDF del flujo legacy, incluso si falta el archivo.
  // Consultar el panel nunca solicita un análisis: solo el botón explícito lo hace.
  const isPdf = result.status === "PDF_READY" || result.status === "PDF_UNAVAILABLE";
  const analysis = isPdf ? (
    <IntegratedAnalysisSection
      studyId={parsedId.data}
      analysisId={requestedAnalysis.success ? requestedAnalysis.data : undefined}
    />
  ) : (
    // Se muestra siempre que el estudio sea accesible, incluso con la onda no disponible. Tiene su propio
    // `Suspense`: el visor no espera al análisis.
    <Suspense
      fallback={
        <p role="status" className="text-muted">
          {ANALYSIS_MESSAGES.loading}
        </p>
      }
    >
      <AnalysisSection
        actor={actor}
        studyId={parsedId.data}
        analysisId={requestedAnalysis.success ? requestedAnalysis.data : undefined}
      />
    </Suspense>
  );

  const uploadedBy = study.uploadedBy.kind === "PATIENT" ? "El propio paciente" : study.uploadedBy.fullName;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={back.href}
        className="inline-flex w-fit items-center gap-1.5 rounded-control text-sm font-semibold text-muted outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring [&_svg]:rotate-180"
      >
        <ClinicalIcon name="arrow" />
        {back.label}
      </Link>

      <header className={`${cardClassName} flex flex-col gap-5 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-panel bg-primary/10 text-primary [&_svg]:!size-7"
          >
            <ClinicalIcon name="studies" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="clinical-page-title">Estudio {study.number}</h1>
            <p className="text-sm text-muted">{STUDY_MESSAGES.typeLabel}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 font-label text-xs font-semibold text-success">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {STUDY_MESSAGES.statusLabel}
          </span>
        </div>
        <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {actor.kind === "DOCTOR" ? (
            <MetaItem label="Paciente">{study.patientName ?? STUDY_MESSAGES.patientWithoutName}</MetaItem>
          ) : null}
          <MetaItem label="Fecha y hora de carga">
            <time dateTime={study.uploadedAt.toISOString()} className="tabular-nums">
              {formatUploadedAt(study.uploadedAt)}
            </time>
          </MetaItem>
          <MetaItem label="Cargado por">{uploadedBy}</MetaItem>
        </dl>
      </header>

      {result.status === "READY" || result.status === "PDF_READY" ? (
        <>
          <section aria-labelledby="study-signal-title" className={`${cardClassName} flex flex-col gap-4 p-4 sm:p-6`}>
            <h2 id="study-signal-title" className="text-lg font-bold tracking-tight">
              Señal del electrocardiograma
            </h2>
            {result.status === "PDF_READY" ? (
              <PdfStudyViewer leads={result.leads} />
            ) : (
              <>
                <StudyViewer leads={result.leads} />
                <div className="border-t border-border pt-4">
                  <WaveformSummary />
                </div>
              </>
            )}
          </section>
          {analysis}
        </>
      ) : (
        <>
          {analysis}
          <WaveformUnavailable />
        </>
      )}
    </div>
  );
}
