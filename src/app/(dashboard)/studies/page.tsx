import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getStudiesModule } from "@/modules/studies/composition";
import { MAX_UPLOAD_BYTES } from "@/modules/studies/domain/ecg-study";

import { requireClinicContext } from "../../_lib/access";
import { toStudyActor } from "../../_lib/study-actor";
import { Pagination } from "../_studies/_components/pagination";
import { StudiesList } from "../_studies/_components/studies-list";
import { UploadForm } from "../_studies/_components/upload-form";
import { STUDY_MESSAGES } from "../_studies/_lib/study-messages";

export const metadata: Metadata = { title: "Mis estudios" };

export default function StudiesPage({ searchParams }: PageProps<"/studies">) {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Mis estudios</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <StudiesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function StudiesContent({ searchParams }: { searchParams: PageProps<"/studies">["searchParams"] }) {
  const context = await requireClinicContext();
  const actor = toStudyActor(context);

  // Un administrador que no es médico no ve estudios; un médico trabaja desde la lista de sus pacientes.
  if (!actor) {
    return <p className="text-base">{STUDY_MESSAGES.adminWithoutStudies}</p>;
  }

  if (actor.kind === "DOCTOR") {
    redirect("/patients");
  }

  const { page } = await searchParams;
  const result = await getStudiesModule().listStudies({
    actor,
    patientId: actor.patientId,
    page: Array.isArray(page) ? page[0] : page,
  });

  return (
    <div className="flex flex-col gap-6">
      <UploadForm maxBytes={MAX_UPLOAD_BYTES} />
      <StudiesList studies={result.items} />
      <Pagination page={result.page} totalPages={result.totalPages} basePath="/studies" />
    </div>
  );
}
