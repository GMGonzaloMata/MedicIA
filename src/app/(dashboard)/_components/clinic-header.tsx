import Link from "next/link";
import { Suspense } from "react";

import { getAccessContext } from "../../_lib/access";
import { describeRelationship } from "../_lib/relationship-labels";
import { SignOutButton } from "./sign-out-button";

// Encabezado de las pantallas protegidas: la clínica activa siempre visible y el acceso para
// cambiarla (spec FR-020). Lee la sesión en cada solicitud, así que va dentro de <Suspense>.
export function ClinicHeader() {
  return (
    <header className="dashboard-sidebar">
      <p className="dashboard-brand">
        <span aria-hidden="true" className="dashboard-monogram">M</span>
        MedicIA
      </p>
      <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
        <ActiveClinic />
      </Suspense>
      <div className="dashboard-session">
        <SignOutButton />
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
    <>
      <div className="dashboard-clinic space-y-2 text-sm">
        <p className="dashboard-label">Clínica activa</p>
        <p className="font-semibold">{context.clinic.tenantName}</p>
        <p className="text-muted">{describeRelationship(context.clinic.relationship)}</p>
      </div>
      <nav aria-label="Navegación principal" className="dashboard-nav">
        <Link href="/" className="dashboard-nav-link">Inicio</Link>
        {context.clinic.relationship.kind === "PATIENT" ? (
          <Link href="/studies" className="dashboard-nav-link">
            Mis estudios
          </Link>
        ) : null}
        {context.clinic.relationship.kind === "STAFF" && context.clinic.relationship.isDoctor ? (
          <Link href="/patients" className="dashboard-nav-link">
            Mis pacientes
          </Link>
        ) : null}
        <Link href="/select-clinic" className="dashboard-nav-link">
          Cambiar de clínica
        </Link>
      </nav>
    </>
  );
}
