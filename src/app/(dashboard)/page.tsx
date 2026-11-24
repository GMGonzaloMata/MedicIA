import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getDoctorOverview } from "@/modules/studies/composition";
import { getTenantsModule } from "@/modules/tenants/composition";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";

import { requireClinicContext } from "../_lib/access";
import { toClinicAdminActor } from "../_lib/clinic-admin-actor";
import { toStudyActor } from "../_lib/study-actor";
import { ClinicalIcon } from "./_components/clinical-icon";
import { AdminOverview, type AdminOverviewData } from "./_components/admin-overview";
import { DoctorOverview } from "./_components/doctor-overview";

export const metadata: Metadata = { title: "Inicio" };

export default function HomePage() {
  return (
    <div className="clinical-home">
      <p className="clinical-kicker">Área de trabajo</p>
      <h1 className="clinical-home-title">Inicio</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p role="status" className="clinical-home-dateline">Cargando…</p>}>
        <ClinicWorkspace />
      </Suspense>
    </div>
  );
}

async function ClinicWorkspace() {
  const context = await requireClinicContext();
  const { clinic } = context;
  const actor = toStudyActor(context);
  const adminActor = toClinicAdminActor(context);
  const overview = actor?.kind === "DOCTOR" ? await getDoctorOverview({ actor }).catch(() => null) : null;

  return (
    <>
      <p className="clinical-home-dateline">{clinic.tenantName}</p>
      {clinic.relationship.kind === "PATIENT" ? (
        <WorkspacePanel
          icon="studies"
          title="Estudios clínicos"
          description="Consultá tus estudios y revisá los análisis disponibles."
          destinations={[{ href: "/studies", label: "Mis estudios" }]}
        />
      ) : actor?.kind === "DOCTOR" ? (
        <DoctorOverview overview={overview} />
      ) : (
        <AdminOverview overview={adminActor ? await readAdminOverview(adminActor) : null} />
      )}
    </>
  );
}

// Conteos del Inicio del administrador. Si la lectura falla, el Inicio sigue mostrando los accesos sin cifras.
async function readAdminOverview(actor: ClinicAdminActor): Promise<AdminOverviewData | null> {
  try {
    const tenants = getTenantsModule();
    const [{ members, invitations }, patients] = await Promise.all([
      tenants.listStaff({ actor }),
      tenants.listClinicPatients({ actor }),
    ]);
    const active = members.filter((member) => member.status === "ACTIVE");

    return {
      activeMembers: active.length,
      doctors: active.filter((member) => member.roles.isDoctor).length,
      admins: active.filter((member) => member.roles.isClinicAdmin).length,
      pendingInvitations: invitations.filter((invitation) => invitation.state !== "expired").length,
      expiredInvitations: invitations.filter((invitation) => invitation.state === "expired").length,
      deactivatedDoctors: members.filter((member) => member.status !== "ACTIVE" && member.roles.isDoctor).length,
      patients: patients.length,
      linkedPatients: patients.filter((patient) => patient.status === "LINKED").length,
      pendingLinkPatients: patients.filter((patient) => patient.status === "PENDING").length,
      patientsWithDoctor: patients.filter((patient) => patient.assignments.length > 0).length,
      codesToRenew: patients.filter((patient) => patient.status === "PENDING" && patient.linkCodeState !== "active").length,
    };
  } catch (error) {
    // Solo el nombre del error: el mensaje puede traer datos personales.
    console.error(`[clínica] error inesperado: ${error instanceof Error ? error.name : "Error"}`);

    return null;
  }
}

interface WorkspacePanelProps {
  icon: "clinic" | "studies";
  title: string;
  description: string;
  destinations?: { href: string; label: string }[];
}

function WorkspacePanel({ icon, title, description, destinations = [] }: WorkspacePanelProps) {
  return (
    <section aria-labelledby="clinical-workspace-title" className="clinical-workspace">
      <div className="clinical-workspace-body">
        <h2 id="clinical-workspace-title">{title}</h2>
        <p>{description}</p>
        <div className="flex flex-wrap gap-x-4">
          {destinations.map((destination) => (
            <Link key={destination.href} href={destination.href} className="clinical-home-action">
              {destination.label}
              <ClinicalIcon name="arrow" />
            </Link>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="clinical-workspace-plate">
        <ClinicalIcon name={icon} />
      </div>
    </section>
  );
}
