import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { linkClassName } from "@/components/form/button-styles";
import { getStudiesModule } from "@/modules/studies/composition";
import { MAX_UPLOAD_BYTES } from "@/modules/studies/domain/ecg-study";
import { StudyForbiddenError } from "@/modules/studies/domain/study-errors";

import { requireClinicContext } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { Pagination } from "../../_studies/_components/pagination";
import { StudiesList } from "../../_studies/_components/studies-list";
import { UploadForm } from "../../_studies/_components/upload-form";
import { formatUploadedAt, STUDY_MESSAGES } from "../../_studies/_lib/study-messages";
import { ClinicalIcon } from "../../_components/clinical-icon";
import { initialsOf } from "../../_lib/initials";
import { ModalDialog } from "../../clinic/_components/modal-dialog";

export const metadata: Metadata = { title: "Estudios del paciente" };

type DetailProps = PageProps<"/patients/[patientId]">;

export default function PatientStudiesPage({ params, searchParams }: DetailProps) {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <PatientStudiesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function NoAccess() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">Sin acceso</h1>
      <p className="text-base">{STUDY_MESSAGES.patientNoAccess}</p>
      <p>
        <Link href="/patients" className={linkClassName}>
          Volver a mis pacientes
        </Link>
      </p>
    </>
  );
}

async function PatientStudiesContent({
  params,
  searchParams,
}: {
  params: DetailProps["params"];
  searchParams: DetailProps["searchParams"];
}) {
  const actor = toStudyActor(await requireClinicContext());

  if (!actor) {
    return <p className="text-base">{STUDY_MESSAGES.adminWithoutStudies}</p>;
  }

  if (actor.kind === "PATIENT") {
    redirect("/studies");
  }

  const parsedId = z.uuid().safeParse((await params).patientId);

  // Un identificador mal formado, ajeno, de otra clínica o sin asignación vigente se ve igual: sin datos.
  if (!parsedId.success) {
    return <NoAccess />;
  }

  const patientId = parsedId.data;
  const { page } = await searchParams;
  const studies = getStudiesModule();

  let patient;
  let result;

  try {
    patient = await studies.getAssignedPatient({ actor, patientId });
    result = await studies.listStudies({
      actor,
      patientId,
      page: Array.isArray(page) ? page[0] : page,
    });
  } catch (error) {
    if (error instanceof StudyForbiddenError) {
      return <NoAccess />;
    }
    throw error;
  }

  const name = patient.fullName ?? STUDY_MESSAGES.patientWithoutName;
  // La lista va del más reciente al más antiguo: en la primera página, el primero es el último cargado.
  const lastStudy = result.page === 1 ? result.items[0] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/patients"
        className="inline-flex w-fit items-center gap-1.5 rounded-control text-sm font-semibold text-muted outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring [&_svg]:rotate-180"
      >
        <ClinicalIcon name="arrow" />
        Mis pacientes
      </Link>

      <header className="flex flex-col gap-4 rounded-panel border border-border bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:flex-row sm:items-center sm:p-6">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-panel bg-primary/10 font-label text-lg font-bold text-primary [&_svg]:!size-6"
        >
          {patient.fullName ? initialsOf(patient.fullName) : <ClinicalIcon name="patients" />}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="clinical-page-title break-words">Estudios de {name}</h1>
          <p className="flex flex-col gap-y-1 text-sm text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span>Documento {patient.documentNumber}</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>{patient.studyCount === 1 ? "1 estudio registrado" : `${patient.studyCount} estudios registrados`}</span>
            {lastStudy ? (
              <>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>
                  Último estudio:{" "}
                  <time dateTime={lastStudy.uploadedAt.toISOString()} className="font-medium tabular-nums text-foreground">
                    {formatUploadedAt(lastStudy.uploadedAt)}
                  </time>
                </span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <section aria-labelledby="patient-studies-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="patient-studies-title" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            Estudios
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label text-xs tabular-nums text-primary">
              {result.totalItems}
            </span>
          </h2>
          <ModalDialog
            triggerLabel="Cargar estudio"
            title="Cargar estudio"
            description={`Para ${name}. El archivo se valida al subirlo; cargarlo no ejecuta ningún análisis.`}
          >
            <UploadForm patientId={patientId} maxBytes={MAX_UPLOAD_BYTES} framed={false} />
          </ModalDialog>
        </div>
        <StudiesList studies={result.items} emptyHint="Usá «Cargar estudio» para subir el primer electrocardiograma." />
        <Pagination page={result.page} totalPages={result.totalPages} basePath={`/patients/${patientId}`} />
      </section>
    </div>
  );
}
