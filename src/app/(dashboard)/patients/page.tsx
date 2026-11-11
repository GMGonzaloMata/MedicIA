import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getStudiesModule } from "@/modules/studies/composition";

import { requireClinicContext } from "../../_lib/access";
import { toStudyActor } from "../../_lib/study-actor";
import { Pagination } from "../_studies/_components/pagination";
import { PatientsList } from "../_studies/_components/patients-list";
import { STUDY_MESSAGES } from "../_studies/_lib/study-messages";

export const metadata: Metadata = { title: "Mis pacientes" };

export default function PatientsPage({ searchParams }: PageProps<"/patients">) {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Mis pacientes</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <PatientsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PatientsContent({ searchParams }: { searchParams: PageProps<"/patients">["searchParams"] }) {
  const actor = toStudyActor(await requireClinicContext());

  // Un administrador que no es médico no ve estudios; un paciente trabaja desde «Mis estudios».
  if (!actor) {
    return <p className="text-base">{STUDY_MESSAGES.adminWithoutStudies}</p>;
  }

  if (actor.kind === "PATIENT") {
    redirect("/studies");
  }

  const { page } = await searchParams;
  const result = await getStudiesModule().listDoctorPatients({
    actor,
    page: Array.isArray(page) ? page[0] : page,
  });

  return (
    <div className="flex flex-col gap-6">
      <PatientsList patients={result.items} />
      <Pagination page={result.page} totalPages={result.totalPages} basePath="/patients" />
    </div>
  );
}
