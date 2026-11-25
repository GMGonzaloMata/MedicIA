import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getStudiesModule } from "@/modules/studies/composition";
import { MAX_UPLOAD_BYTES } from "@/modules/studies/domain/ecg-study";

import { requireClinicContext } from "../../_lib/access";
import { toStudyActor } from "../../_lib/study-actor";
import { AttendingDoctorNotice } from "../_studies/_components/attending-doctor-notice";
import { Pagination } from "../_studies/_components/pagination";
import { StudiesList } from "../_studies/_components/studies-list";
import { UploadForm } from "../_studies/_components/upload-form";
import { formatUploadedAt, STUDY_MESSAGES } from "../_studies/_lib/study-messages";
import { ClinicalIcon } from "../_components/clinical-icon";
import { ModalDialog } from "../clinic/_components/modal-dialog";

export const metadata: Metadata = { title: "Mis estudios" };

const pageTitleClassName = "text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl";

export default function StudiesPage({ searchParams }: PageProps<"/studies">) {
  return (
    // Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense.
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <StudiesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StudiesContent({ searchParams }: { searchParams: PageProps<"/studies">["searchParams"] }) {
  const context = await requireClinicContext();
  const actor = toStudyActor(context);

  // Un administrador que no es médico no ve estudios; un médico trabaja desde la lista de sus pacientes.
  if (!actor) {
    return (
      <>
        <h1 className={pageTitleClassName}>Mis estudios</h1>
        <p className="text-base">{STUDY_MESSAGES.adminWithoutStudies}</p>
      </>
    );
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
  // La lista va del más reciente al más antiguo: en la primera página, el primero es el último cargado.
  const lastStudy = result.page === 1 ? result.items[0] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <AttendingDoctorNotice tenantId={actor.tenantId} patientId={actor.patientId} />

      <header className="flex flex-col gap-4 rounded-panel border border-border bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:flex-row sm:items-center sm:p-6">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-panel bg-primary/10 text-primary [&_svg]:!size-6"
        >
          <ClinicalIcon name="studies" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="clinical-page-title break-words">Mis estudios</h1>
          <p className="flex flex-col gap-y-1 text-sm text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span>{result.totalItems === 1 ? "1 estudio registrado" : `${result.totalItems} estudios registrados`}</span>
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

      <section aria-labelledby="my-studies-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="my-studies-title" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            Estudios
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label text-xs tabular-nums text-primary">
              {result.totalItems}
            </span>
          </h2>
          <ModalDialog
            triggerLabel="Cargar estudio"
            title="Cargar estudio"
            description="El archivo se valida al subirlo; cargarlo no ejecuta ningún análisis."
          >
            <UploadForm maxBytes={MAX_UPLOAD_BYTES} framed={false} />
          </ModalDialog>
        </div>
        <StudiesList studies={result.items} emptyHint="Usá «Cargar estudio» para subir tu primer electrocardiograma." />
        <Pagination page={result.page} totalPages={result.totalPages} basePath="/studies" />
      </section>
    </div>
  );
}
