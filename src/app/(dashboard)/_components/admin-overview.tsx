import "server-only";

import Link from "next/link";

import { ClinicalIcon } from "./clinical-icon";

// Conteos de la clínica para el Inicio del administrador. Son los de este momento: no hay datos en vivo.
export interface AdminOverviewData {
  activeMembers: number;
  doctors: number;
  admins: number;
  deactivatedDoctors: number;
  pendingInvitations: number;
  expiredInvitations: number;
  patients: number;
  linkedPatients: number;
  pendingLinkPatients: number;
  patientsWithDoctor: number;
  // Pacientes sin vincular cuyo último código ya no sirve (vencido, usado, reemplazado, bloqueado o inexistente).
  codesToRenew: number;
}

const countFormat = new Intl.NumberFormat("es-AR");
const panel = "rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]";

function plural(count: number, one: string, many: string): string {
  return `${countFormat.format(count)} ${count === 1 ? one : many}`;
}

export function AdminOverview({ overview }: { overview: AdminOverviewData | null }) {
  const withoutDoctor = overview ? overview.patients - overview.patientsWithDoctor : 0;

  return (
    <section aria-labelledby="clinical-workspace-title" className="mt-6 flex flex-col gap-5">
      <div className={`${panel} flex items-start gap-4 p-5`}>
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-card bg-primary/10 text-primary">
          <ClinicalIcon name="clinic" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="clinical-workspace-title" className="text-lg font-bold tracking-tight">
            Perfil administrativo
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Este perfil no tiene acceso a estudios. Desde acá administrás el personal y los pacientes de la clínica.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ModuleCard
          kicker="Módulo asistencial"
          icon="clinic"
          title="Personal de la clínica"
          description="Invitá a médicos y administradores, y controlá quién tiene acceso."
          href="/clinic/staff"
          action="Gestionar personal"
          footnote={
            overview && overview.expiredInvitations > 0
              ? plural(overview.expiredInvitations, "invitación vencida", "invitaciones vencidas")
              : null
          }
          metrics={
            overview
              ? [
                  {
                    label: "Miembros activos",
                    value: overview.activeMembers,
                    note: `${plural(overview.doctors, "médico", "médicos")} · ${plural(overview.admins, "administrador", "administradores")}`,
                    dot: "bg-primary",
                  },
                  {
                    label: "Invitaciones pendientes",
                    value: overview.pendingInvitations,
                    note: "esperan respuesta",
                    dot: "bg-info",
                  },
                ]
              : []
          }
        />
        <ModuleCard
          kicker="Admisión y vinculación"
          icon="patients"
          title="Pacientes de la clínica"
          description="Registrá pacientes por documento, entregales su código y asignales un médico."
          href="/clinic/patients"
          action="Gestionar pacientes"
          footnote={withoutDoctor > 0 ? `${plural(withoutDoctor, "paciente", "pacientes")} sin médico` : null}
          metrics={
            overview
              ? [
                  {
                    label: "Registrados",
                    value: overview.patients,
                    note: plural(overview.linkedPatients, "vinculado", "vinculados"),
                    dot: "bg-info",
                  },
                  {
                    label: "Por vincular",
                    value: overview.pendingLinkPatients,
                    note: "esperan su cuenta",
                    dot: "bg-warning",
                  },
                ]
              : []
          }
        />
      </div>

      {overview ? <OperationalSummary overview={overview} /> : null}
      {overview ? <GettingStarted overview={overview} /> : null}
    </section>
  );
}

interface Metric {
  label: string;
  value: number;
  note?: string;
  dot: string;
}

function ModuleCard({
  kicker,
  icon,
  title,
  description,
  href,
  action,
  footnote,
  metrics,
}: {
  kicker: string;
  icon: "clinic" | "patients";
  title: string;
  description: string;
  href: string;
  action: string;
  footnote: string | null;
  metrics: Metric[];
}) {
  return (
    <article className={`${panel} relative flex flex-col gap-5 overflow-hidden p-5 sm:p-6`}>
      {/* Marca de agua decorativa: no aporta información. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-4 text-primary opacity-[0.12] [&_svg]:size-20 [&_svg]:stroke-[0.8]"
      >
        <ClinicalIcon name={icon} />
      </span>
      <div className="relative flex flex-col gap-2">
        <p className="flex items-center gap-2 font-label text-xs font-semibold uppercase tracking-wider text-muted">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-card bg-primary/10 text-primary [&_svg]:size-4">
            <ClinicalIcon name={icon} />
          </span>
          {kicker}
        </p>
        <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
        <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>
      </div>
      {metrics.length > 0 ? (
        <dl className="relative grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-1 rounded-card bg-elevated p-4">
              <dt className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
                {metric.label}
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${metric.dot}`} />
              </dt>
              <dd className="font-sans text-3xl font-extrabold leading-none tracking-tight tabular-nums">
                {countFormat.format(metric.value)}
              </dd>
              {metric.note ? <p className="text-xs text-muted">{metric.note}</p> : null}
            </div>
          ))}
        </dl>
      ) : null}
      {/* El contenedor empuja la fila al pie para que las dos tarjetas queden alineadas. */}
      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3">
        <Link href={href} className="clinical-home-action !mt-0">
          {action}
          <ClinicalIcon name="arrow" />
        </Link>
        {footnote ? <p className="text-xs font-medium text-muted">{footnote}</p> : null}
      </div>
    </article>
  );
}

// Lo que conviene mirar de un vistazo. «Acción» aparece solo cuando hay algo para resolver.
function OperationalSummary({ overview }: { overview: AdminOverviewData }) {
  const withoutDoctor = overview.patients - overview.patientsWithDoctor;
  const items = [
    {
      label: "Médicos activos",
      value: overview.doctors,
      note:
        overview.deactivatedDoctors > 0
          ? plural(overview.deactivatedDoctors, "desactivado", "desactivados")
          : "Ninguno desactivado",
      needsAction: false,
    },
    {
      label: "Pacientes con médico",
      value: overview.patientsWithDoctor,
      note: `de ${plural(overview.patients, "paciente registrado", "pacientes registrados")}`,
      needsAction: false,
    },
    {
      label: "Sin médico asignado",
      value: withoutDoctor,
      note: withoutDoctor > 0 ? "Asignales un médico" : "Todos tienen médico",
      needsAction: withoutDoctor > 0,
    },
    {
      label: "Códigos por renovar",
      value: overview.codesToRenew,
      note: overview.codesToRenew > 0 ? "Generá un código nuevo" : "Sin códigos vencidos",
      needsAction: overview.codesToRenew > 0,
    },
  ];

  return (
    <section aria-labelledby="operational-summary-title" className="flex flex-col gap-3">
      <h3 id="operational-summary-title" className="text-lg font-bold tracking-tight">
        Resumen operativo
      </h3>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className={`${panel} flex flex-col gap-2 p-4`}>
            <dt className="flex items-start justify-between gap-2 font-label text-xs font-semibold uppercase tracking-wider text-muted">
              {item.label}
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold normal-case tracking-normal ${
                  item.needsAction ? "bg-warning-surface text-warning" : "bg-success-surface text-success"
                }`}
              >
                {item.needsAction ? "Acción" : "Al día"}
              </span>
            </dt>
            <dd className="font-sans text-3xl font-extrabold leading-none tracking-tight tabular-nums">
              {countFormat.format(item.value)}
            </dd>
            <p className="text-xs text-muted">{item.note}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Orienta a una clínica nueva. Cada paso se marca con datos reales y la sección desaparece al completarlos.
function GettingStarted({ overview }: { overview: AdminOverviewData }) {
  const steps = [
    {
      title: "Invitá a tu equipo médico",
      description: "Mandá la invitación con la especialidad y la matrícula de cada médico.",
      done: overview.doctors > 0,
    },
    {
      title: "Registrá al paciente",
      description: "Cargá su documento y entregale el código de vinculación: vence a los 7 días.",
      done: overview.patients > 0,
    },
    {
      title: "Asigná un médico",
      description: "Con una asignación vigente, el médico ve al paciente y sus estudios.",
      done: overview.patientsWithDoctor > 0,
    },
  ];

  if (steps.every((step) => step.done)) {
    return null;
  }

  return (
    <section aria-labelledby="getting-started-title" className={`${panel} flex flex-col gap-4 p-5 sm:p-6`}>
      <div className="flex flex-col gap-1">
        <p className="font-label text-xs font-semibold uppercase tracking-wider text-primary">Para empezar</p>
        <h3 id="getting-started-title" className="text-lg font-bold tracking-tight">
          Primeros pasos en la clínica
        </h3>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-card bg-elevated p-4">
            <div className="flex items-center justify-between gap-2">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-full bg-primary/10 font-label text-sm font-bold text-primary"
              >
                {index + 1}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label text-xs font-semibold ${
                  step.done ? "bg-success-surface text-success" : "bg-warning-surface text-warning"
                }`}
              >
                {step.done ? <ClinicalIcon name="check" /> : null}
                {step.done ? "Hecho" : "Pendiente"}
              </span>
            </div>
            <p className="font-semibold">{step.title}</p>
            <p className="text-sm leading-relaxed text-muted">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
