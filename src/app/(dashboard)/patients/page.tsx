import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getStudiesModule } from "@/modules/studies/composition";
import {
  RECENT_STUDY_DAYS,
  type PatientListFilter,
  type PatientListSort,
} from "@/modules/studies/domain/patient-list";

import { ClinicalIcon } from "../_components/clinical-icon";
import { requireClinicContext } from "../../_lib/access";
import { toStudyActor } from "../../_lib/study-actor";
import { StatCards } from "../clinic/_components/stat-cards";
import { ViewTabs } from "../clinic/_components/view-tabs";
import { Pagination } from "../_studies/_components/pagination";
import { PatientsList } from "../_studies/_components/patients-list";
import { STUDY_MESSAGES } from "../_studies/_lib/study-messages";

export const metadata: Metadata = { title: "Mis pacientes" };

type SearchParams = PageProps<"/patients">["searchParams"];

// Valores de la dirección, en español, y su equivalente del dominio. El primero de cada lista es el de omisión.
const SORTS: { param: string | null; value: PatientListSort; label: string }[] =
  [
    { param: null, value: "recent", label: "Último estudio" },
    { param: "nombre", value: "name", label: "Nombre" },
  ];

const FILTERS: {
  param: string | null;
  value: PatientListFilter;
  label: string;
  empty: string;
}[] = [
  {
    param: null,
    value: "all",
    label: "Todos",
    empty: STUDY_MESSAGES.noPatients,
  },
  {
    param: "recientes",
    value: "recent",
    label: "Con estudios recientes",
    empty: `Ningún paciente tiene estudios cargados en los últimos ${RECENT_STUDY_DAYS} días.`,
  },
  {
    param: "sin-estudios",
    value: "without-studies",
    label: "Sin estudios",
    empty: "Todos tus pacientes tienen estudios cargados.",
  },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Arma la dirección de la lista conservando solo los parámetros que no tienen el valor de omisión.
function listHref(params: {
  q: string | null;
  orden: string | null;
  vista: string | null;
}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const text = query.toString();

  return text ? `/patients?${text}` : "/patients";
}

export default function PatientsPage({ searchParams }: PageProps<"/patients">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="clinical-page-title">Mis pacientes</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <PatientsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PatientsContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireClinicContext();
  const actor = toStudyActor(context);

  // Un administrador que no es médico no ve estudios; un paciente trabaja desde «Mis estudios».
  if (!actor) {
    return (
      <p className="rounded-panel border border-border bg-card p-5 text-base">
        {STUDY_MESSAGES.adminWithoutStudies}
      </p>
    );
  }

  if (actor.kind === "PATIENT") {
    redirect("/studies");
  }

  const params = await searchParams;
  const sort =
    SORTS.find((option) => option.param === first(params.orden)) ?? SORTS[0];
  const filter =
    FILTERS.find((option) => option.param === first(params.vista)) ??
    FILTERS[0];
  const result = await getStudiesModule().listDoctorPatients({
    actor,
    page: first(params.page),
    search: first(params.q),
    sort: sort.value,
    filter: filter.value,
  });
  const current = { q: result.search, orden: sort.param, vista: filter.param };
  const counts = {
    all: result.counts.total,
    recent: result.counts.recent,
    "without-studies": result.counts.withoutStudies,
  };

  return (
    <>
      <p className="-mt-4 flex items-start gap-2 text-sm text-muted sm:text-base [&_svg]:mt-0.5 [&_svg]:text-primary">
        <ClinicalIcon name="clinic" />
        <span>
          Pacientes con una asignación vigente a tu nombre en{" "}
          <strong className="font-semibold text-foreground">
            {context.clinic.tenantName}
          </strong>
        </span>
      </p>
      <StatCards
        stats={[
          {
            label: "Pacientes asignados",
            value: result.counts.total,
            icon: "patients",
          },
          {
            label: `Con estudios en los últimos ${RECENT_STUDY_DAYS} días`,
            value: result.counts.recent,
            icon: "studies",
          },
          {
            label: "Sin estudios cargados",
            value: result.counts.withoutStudies,
            icon: "info",
          },
        ]}
        columns={3}
      />

      {/* Sin pacientes asignados no hay nada que buscar ni filtrar. */}
      {result.counts.total > 0 ? (
        <div className="flex flex-col gap-4 rounded-panel border border-border bg-card p-4 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Form
              action="/patients"
              role="search"
              className="relative flex min-w-0 flex-1 items-center"
            >
              {sort.param ? (
                <input type="hidden" name="orden" value={sort.param} />
              ) : null}
              {filter.param ? (
                <input type="hidden" name="vista" value={filter.param} />
              ) : null}
              <label htmlFor="patient-search" className="sr-only">
                Buscar paciente por nombre o documento
              </label>
              {/* Lupa decorativa a la izquierda; el botón de la derecha envía la búsqueda (Enter también). */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 text-muted [&_svg]:!size-5"
              >
                <ClinicalIcon name="search" />
              </span>
              <input
                id="patient-search"
                type="search"
                name="q"
                defaultValue={result.search ?? ""}
                maxLength={80}
                autoComplete="off"
                placeholder="Nombre o documento…"
                className="min-h-11 w-full min-w-0 rounded-control border border-input-border bg-elevated/40 pl-10 pr-12 text-base text-foreground outline-offset-2 transition-colors placeholder:text-muted hover:border-primary/50 focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
              />
              <button
                type="submit"
                aria-label="Buscar"
                className="absolute right-1 grid size-9 place-items-center rounded-control bg-primary text-primary-foreground outline-offset-2 transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-ring [&_svg]:!size-4"
              >
                <ClinicalIcon name="arrow" />
              </button>
            </Form>
            <nav
              aria-label="Ordenar pacientes"
              className="flex items-center gap-2 text-sm"
            >
              <span aria-hidden="true" className="text-muted">
                Ordenar por:
              </span>
              <div className="flex gap-1 rounded-card bg-elevated p-1">
                {SORTS.map((option) => (
                  <Link
                    key={option.value}
                    href={listHref({ ...current, orden: option.param })}
                    scroll={false}
                    aria-current={
                      option.value === sort.value ? "page" : undefined
                    }
                    aria-label={`Ordenar por ${option.label.toLowerCase()}`}
                    className="relative inline-flex h-9 items-center rounded-control px-3 font-semibold text-muted outline-offset-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_1px_2px_rgb(15_23_42/0.12)]"
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
          <ViewTabs
            label="Filtrar pacientes"
            tabs={FILTERS.map((option) => ({
              href: listHref({ ...current, vista: option.param }),
              label: option.label,
              count: counts[option.value],
              isCurrent: option.value === filter.value,
            }))}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {result.search ? (
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"
          >
            <span>
              {result.totalItems === 1
                ? "1 resultado"
                : `${result.totalItems} resultados`}{" "}
              para{" "}
              <strong className="font-semibold text-foreground">
                «{result.search}»
              </strong>
            </span>
            <Link
              href={listHref({ ...current, q: null })}
              className="rounded-control font-semibold text-primary underline underline-offset-4 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Limpiar búsqueda
            </Link>
          </p>
        ) : null}
        <PatientsList
          patients={result.items}
          emptyMessage={
            result.search
              ? `No encontramos pacientes que coincidan con «${result.search}».`
              : filter.empty
          }
          emptyHint={
            result.search
              ? "Revisá el nombre o el número de documento, o buscá en todos tus pacientes."
              : filter.value === "all"
                ? "Cuando la clínica te asigne un paciente, va a aparecer acá con sus estudios."
                : "Elegí «Todos» para ver la lista completa."
          }
        />
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          basePath="/patients"
          params={Object.fromEntries(
            Object.entries(current).filter((entry): entry is [string, string] =>
              Boolean(entry[1]),
            ),
          )}
        />
      </div>
    </>
  );
}
