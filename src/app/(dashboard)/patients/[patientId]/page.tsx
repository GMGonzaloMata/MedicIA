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
import { STUDY_MESSAGES } from "../../_studies/_lib/study-messages";

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
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Sin acceso</h1>
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

  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">
        Estudios de {patient.fullName ?? STUDY_MESSAGES.patientWithoutName}
      </h1>
      <p className="text-base text-muted">Documento {patient.documentNumber}</p>
      <div className="flex flex-col gap-6">
        <UploadForm patientId={patientId} maxBytes={MAX_UPLOAD_BYTES} />
        <StudiesList studies={result.items} />
        <Pagination page={result.page} totalPages={result.totalPages} basePath={`/patients/${patientId}`} />
      </div>
      <p>
        <Link href="/patients" className={linkClassName}>
          Volver a mis pacientes
        </Link>
      </p>
    </>
  );
}
