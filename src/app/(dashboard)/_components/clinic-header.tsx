import { Suspense } from "react";

import { getAccessContext } from "../../_lib/access";
import { describeRelationship } from "../_lib/relationship-labels";
import { ClinicalIcon } from "./clinical-icon";
import { DashboardNavLink } from "./dashboard-nav-link";
import { SignOutButton } from "./sign-out-button";

export function ClinicHeader() {
  return (
    <header className="clinical-sidebar">
      <p className="clinical-brand">Medic<span>IA</span></p>
      <Suspense fallback={<p role="status" className="clinical-sidebar-loading">Cargando…</p>}>
        <ActiveClinic />
      </Suspense>
      <div className="clinical-session">
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
      <nav aria-label="Navegación principal" className="clinical-nav">
        <DashboardNavLink href="/" className="clinical-nav-link">
          <ClinicalIcon name="home" />
          <span>Inicio</span>
        </DashboardNavLink>
        {context.clinic.relationship.kind === "PATIENT" ? (
          <DashboardNavLink href="/studies" className="clinical-nav-link">
            <ClinicalIcon name="studies" />
            <span>Mis estudios</span>
          </DashboardNavLink>
        ) : null}
        {context.clinic.relationship.kind === "STAFF" && context.clinic.relationship.isDoctor ? (
          <DashboardNavLink href="/patients" className="clinical-nav-link">
            <ClinicalIcon name="patients" />
            <span>Mis pacientes</span>
          </DashboardNavLink>
        ) : null}
        {context.clinic.relationship.kind === "STAFF" && context.clinic.relationship.isClinicAdmin ? (
          <DashboardNavLink href="/clinic/staff" className="clinical-nav-link">
            <ClinicalIcon name="clinic" />
            <span>Personal</span>
          </DashboardNavLink>
        ) : null}
        <DashboardNavLink href="/select-clinic" className="clinical-nav-link">
          <ClinicalIcon name="switch" />
          <span>Cambiar de clínica</span>
        </DashboardNavLink>
      </nav>
      <div className="clinical-clinic">
        <p className="clinical-kicker">Clínica activa</p>
        <p className="clinical-clinic-name">{context.clinic.tenantName}</p>
        <p className="clinical-clinic-role">{describeRelationship(context.clinic.relationship)}</p>
      </div>
    </>
  );
}
