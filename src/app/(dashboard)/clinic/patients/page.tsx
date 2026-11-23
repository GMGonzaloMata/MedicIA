import type { Metadata } from "next";
import { Suspense } from "react";

import { getTenantsModule } from "@/modules/tenants/composition";

import { requireClinicContext } from "../../../_lib/access";
import { toClinicAdminActor } from "../../../_lib/clinic-admin-actor";
import { RegisterPatientForm } from "../_components/register-patient-form";
import { ClinicPatientsList } from "../_components/patients-lists";
import { CLINIC_MESSAGES } from "../_lib/clinic-messages";

export const metadata: Metadata = { title: "Pacientes de la clínica" };

export default function ClinicPatientsPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">Pacientes de la clínica</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <PatientsContent />
      </Suspense>
    </>
  );
}

async function PatientsContent() {
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

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="register-title" className="flex flex-col gap-4">
        <h2 id="register-title" className="text-xl font-semibold">Registrar un paciente</h2>
        <RegisterPatientForm />
      </section>
      <section aria-labelledby="patients-title" className="flex flex-col gap-4">
        <h2 id="patients-title" className="text-xl font-semibold">Pacientes</h2>
        <ClinicPatientsList patients={patients} doctors={doctors} />
      </section>
    </div>
  );
}
