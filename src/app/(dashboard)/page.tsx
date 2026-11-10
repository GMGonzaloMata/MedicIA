import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { linkClassName } from "@/components/form/button-styles";

import { requireClinicContext } from "../_lib/access";
import { describeRelationship } from "./_lib/relationship-labels";

export const metadata: Metadata = { title: "Inicio" };

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
    <>
      <p className="text-base">
        Estás trabajando en <strong>{clinic.tenantName}</strong> como{" "}
        {describeRelationship(clinic.relationship).toLowerCase()}.
      </p>
      {clinic.relationship.kind === "PATIENT" ? (
        <p className="text-base">
          <Link href="/studies" className={linkClassName}>
            Mis estudios
          </Link>
        </p>
      ) : null}
    </>
  );
}
