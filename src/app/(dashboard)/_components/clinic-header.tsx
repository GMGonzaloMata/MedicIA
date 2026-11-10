import Link from "next/link";
import { Suspense } from "react";

import { linkClassName } from "@/components/form/button-styles";

import { getAccessContext } from "../../_lib/access";
import { describeRelationship } from "../_lib/relationship-labels";
import { SignOutButton } from "./sign-out-button";

// Encabezado de las pantallas protegidas: la clínica activa siempre visible y el acceso para
// cambiarla (spec FR-020). Lee la sesión en cada solicitud, así que va dentro de <Suspense>.
export function ClinicHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <p className="text-lg font-semibold">MedicIA</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
            <ActiveClinic />
          </Suspense>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

async function ActiveClinic() {
  const context = await getAccessContext();

  // Sin clínica activa no hay nada que mostrar: las pantallas de elección y de sin acceso
  // explican la situación por su cuenta.
  if (context.status !== "ready") {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <p>
        <span className="font-semibold">{context.clinic.tenantName}</span>
        <span className="text-muted"> · {describeRelationship(context.clinic.relationship)}</span>
      </p>
      {context.clinic.relationship.kind === "PATIENT" ? (
        <Link href="/studies" className={linkClassName}>
          Mis estudios
        </Link>
      ) : null}
      {context.clinic.relationship.kind === "STAFF" && context.clinic.relationship.isDoctor ? (
        <Link href="/patients" className={linkClassName}>
          Mis pacientes
        </Link>
      ) : null}
      <Link href="/select-clinic" className={linkClassName}>
        Cambiar de clínica
      </Link>
    </div>
  );
}
