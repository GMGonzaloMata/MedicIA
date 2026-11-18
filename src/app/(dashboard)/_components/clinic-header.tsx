import { Suspense } from "react";

import { getAccessContext } from "../../_lib/access";
import { describeRelationship } from "../_lib/relationship-labels";
import { DashboardNavLink } from "./dashboard-nav-link";
import { SignOutButton } from "./sign-out-button";

// Marco visual reutilizado del rebranding; la clínica y los destinos conservan sus permisos vigentes.
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
  if (context.status !== "ready") return null;

  return (
    <>
      <div className="dashboard-clinic space-y-2 text-sm">
        <p className="dashboard-label">Clínica activa</p>
        <p className="font-semibold">{context.clinic.tenantName}</p>
        <p className="text-muted">{describeRelationship(context.clinic.relationship)}</p>
      </div>
      <nav aria-label="Navegación principal" className="dashboard-nav">
        <DashboardNavLink href="/" className="dashboard-nav-link">Inicio</DashboardNavLink>
        {context.clinic.relationship.kind === "PATIENT" ? (
          <DashboardNavLink href="/studies" className="dashboard-nav-link">
            Mis estudios
          </DashboardNavLink>
        ) : null}
        {context.clinic.relationship.kind === "STAFF" && context.clinic.relationship.isDoctor ? (
          <DashboardNavLink href="/patients" className="dashboard-nav-link">
            Mis pacientes
          </DashboardNavLink>
        ) : null}
        <DashboardNavLink href="/select-clinic" className="dashboard-nav-link">
          Cambiar de clínica
        </DashboardNavLink>
      </nav>
    </>
  );
}
