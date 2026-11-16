import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireClinicContext } from "../_lib/access";
import { describeRelationship } from "./_lib/relationship-labels";

export const metadata: Metadata = { title: "Inicio" };

// El inicio presenta el contexto real y los accesos disponibles, sin métricas inventadas.
export default function HomePage() {
  return (
    <>
      <div className="border-b border-border pb-5">
        <p className="dashboard-label mb-2">MedicIA</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">Inicio</h1>
      </div>
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
    <section aria-label="Contexto de trabajo" className="dashboard-context">
      <h2 className="dashboard-label">Contexto de trabajo</h2>
      <p className="text-base leading-relaxed">
        Estás trabajando en <strong>{clinic.tenantName}</strong> como{" "}
        {describeRelationship(clinic.relationship).toLowerCase()}.
      </p>
      {clinic.relationship.kind === "PATIENT" ? (
        <Link href="/studies" className="dashboard-home-link">
          Mis estudios
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      {clinic.relationship.kind === "STAFF" && clinic.relationship.isDoctor ? (
        <Link href="/patients" className="dashboard-home-link">
          Mis pacientes
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </section>
  );
}
