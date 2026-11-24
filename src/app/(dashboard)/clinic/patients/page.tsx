import type { Metadata } from "next";
import { Suspense } from "react";

import { getTenantsModule } from "@/modules/tenants/composition";

import { requireClinicContext } from "../../../_lib/access";
import { toClinicAdminActor } from "../../../_lib/clinic-admin-actor";
import { StatCards } from "../_components/stat-cards";
import { ModalDialog } from "../_components/modal-dialog";
import { RegisterPatientForm } from "../_components/register-patient-form";
import { ViewTabs } from "../_components/view-tabs";
import { ClinicPatientsList } from "../_components/patients-lists";
import { CLINIC_MESSAGES } from "../_lib/clinic-messages";

export const metadata: Metadata = { title: "Pacientes de la clínica" };

export default function ClinicPatientsPage({ searchParams }: PageProps<"/clinic/patients">) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="clinical-page-title">Pacientes de la clínica</h1>
        <p className="clinical-page-lead">
          Registrá pacientes, asignalos a un médico y entregales el código para vincular su cuenta.
        </p>
      </header>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <PatientsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Las vistas filtran a los pacientes que piden una acción: entregar o renovar el código, o asignar un médico.
const VIEWS = {
  todos: { label: "Todos", empty: "Todavía no hay pacientes registrados en la clínica." },
  "por-vincular": { label: "Por vincular", empty: "No hay pacientes pendientes de vincular." },
  "sin-medico": { label: "Sin médico", empty: "Todos los pacientes tienen un médico asignado." },
} as const;

type PatientView = keyof typeof VIEWS;

function isPatientView(value: unknown): value is PatientView {
  return typeof value === "string" && Object.hasOwn(VIEWS, value);
}

async function PatientsContent({ searchParams }: { searchParams: PageProps<"/clinic/patients">["searchParams"] }) {
  const actor = toClinicAdminActor(await requireClinicContext());

  // Solo administra quien tiene el rol de administrador.
  if (!actor) {
    return <p className="text-base">{CLINIC_MESSAGES.forbidden}</p>;
  }

  const tenants = getTenantsModule();
  const [patients, { members }] = await Promise.all([tenants.listClinicPatients({ actor }), tenants.listStaff({ actor })]);
  const doctors = members
    .filter((member) => member.roles.isDoctor && member.status === "ACTIVE")
    .map((member) => ({
      membershipId: member.membershipId,
      label: member.doctor ? `${member.fullName} · ${member.doctor.specialty}` : member.fullName,
    }));

  const requested = (await searchParams).vista;
  const view: PatientView = isPatientView(requested) ? requested : "todos";
  const byView: Record<PatientView, typeof patients> = {
    todos: patients,
    "por-vincular": patients.filter((patient) => patient.status === "PENDING"),
    "sin-medico": patients.filter((patient) => patient.assignments.length === 0),
  };

  return (
    <div className="flex flex-col gap-6">
      <StatCards
        stats={[
          { label: "Pacientes registrados", value: patients.length, icon: "patients" },
          { label: "Pendientes de vincular", value: byView["por-vincular"].length, icon: "mail" },
          { label: "Cuentas vinculadas", value: patients.filter((patient) => patient.status === "LINKED").length, icon: "studies" },
          { label: "Pacientes sin médico", value: byView["sin-medico"].length, icon: "clinic" },
        ]}
      />
      <section
        aria-labelledby="patients-view-title"
        className="overflow-hidden rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]"
      >
        <h2 id="patients-view-title" className="sr-only">
          Pacientes: {VIEWS[view].label}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <ViewTabs
            label="Filtrar pacientes"
            tabs={(Object.keys(VIEWS) as PatientView[]).map((key) => ({
              href: key === "todos" ? "/clinic/patients" : `/clinic/patients?vista=${key}`,
              label: VIEWS[key].label,
              count: byView[key].length,
              isCurrent: view === key,
            }))}
          />
          <ModalDialog
            triggerLabel="Nuevo paciente"
            title="Registrar un paciente"
            description="Cargá su documento. Al registrarlo se muestra el código para que vincule su cuenta: anotalo, no se puede volver a ver."
          >
            <RegisterPatientForm />
          </ModalDialog>
        </div>
        <ClinicPatientsList patients={byView[view]} doctors={doctors} emptyMessage={VIEWS[view].empty} />
      </section>
    </div>
  );
}
