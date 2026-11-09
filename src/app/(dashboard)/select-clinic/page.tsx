import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../_lib/access";
import { ClinicOptionsForm, type ClinicOption } from "../_components/clinic-options-form";
import { describeRelationship } from "../_lib/relationship-labels";

export const metadata: Metadata = { title: "Elegir clínica" };

export default function SelectClinicPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Elegí una clínica</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <ClinicChoices />
      </Suspense>
    </>
  );
}

async function ClinicChoices() {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  const clinics = await getUsersModule().listAvailableClinics(context.user.id);

  if (clinics.length === 0) {
    redirect("/no-access");
  }

  const activeRelationshipId =
    context.status === "ready"
      ? context.clinic.relationship.kind === "STAFF"
        ? context.clinic.relationship.membershipId
        : context.clinic.relationship.patientId
      : null;

  // Al navegador solo llega el identificador del vínculo, nunca el de la clínica.
  const options: ClinicOption[] = clinics.map((clinic) => ({
    value: `${clinic.kind}:${clinic.relationshipId}`,
    tenantName: clinic.tenantName,
    description: describeRelationship(clinic),
    isActive: clinic.relationshipId === activeRelationshipId,
  }));

  return (
    <>
      <p className="text-base text-muted">Podés cambiar de clínica cuando quieras, sin cerrar sesión.</p>
      <ClinicOptionsForm options={options} />
    </>
  );
}
