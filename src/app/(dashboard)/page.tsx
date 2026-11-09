import type { Metadata } from "next";
import { Suspense } from "react";

import type { ClinicRelationship } from "@/modules/users/domain/access-context";

import { requireClinicContext } from "../_lib/access";

export const metadata: Metadata = { title: "Inicio" };

function describeRelationship(relationship: ClinicRelationship): string {
  if (relationship.kind === "PATIENT") {
    return "paciente";
  }

  if (relationship.isClinicAdmin && relationship.isDoctor) {
    return "administrador de la clínica y médico";
  }

  return relationship.isClinicAdmin ? "administrador de la clínica" : "médico";
}

// Inicio provisional: muestra con qué clínica y vínculo se está trabajando. Las funcionalidades
// siguientes lo reemplazan con el contenido real.
export default function HomePage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Inicio</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <ActiveClinicSummary />
      </Suspense>
    </>
  );
}

async function ActiveClinicSummary() {
  const { clinic } = await requireClinicContext();

  return (
    <p className="text-base">
      Estás trabajando en <strong>{clinic.tenantName}</strong> como{" "}
      {describeRelationship(clinic.relationship)}.
    </p>
  );
}
