import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getDoctorOverview } from "@/modules/studies/composition";

import { requireClinicContext } from "../_lib/access";
import { toStudyActor } from "../_lib/study-actor";
import { ClinicalIcon } from "./_components/clinical-icon";
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
  const overview = actor?.kind === "DOCTOR" ? await getDoctorOverview({ actor }).catch(() => null) : null;

  return (
    <>
      <p className="clinical-home-dateline">{clinic.tenantName}</p>
      {clinic.relationship.kind === "PATIENT" ? (
        <WorkspacePanel
          icon="studies"
          title="Estudios clínicos"
          description="Consultá tus estudios y revisá los análisis disponibles."
          destination={{ href: "/studies", label: "Mis estudios" }}
        />
      ) : actor?.kind === "DOCTOR" ? (
        <DoctorOverview overview={overview} />
      ) : (
        <WorkspacePanel
          icon="clinic"
          title="Perfil administrativo"
          description="Este perfil no tiene acceso a pacientes ni a estudios. Desde acá administrás el personal de la clínica."
          destination={{ href: "/clinic/staff", label: "Personal de la clínica" }}
        />
      )}
    </>
  );
}

interface WorkspacePanelProps {
  icon: "clinic" | "studies";
  title: string;
  description: string;
  destination?: { href: string; label: string };
}

function WorkspacePanel({ icon, title, description, destination }: WorkspacePanelProps) {
  return (
    <section aria-labelledby="clinical-workspace-title" className="clinical-workspace">
      <div className="clinical-workspace-body">
        <h2 id="clinical-workspace-title">{title}</h2>
        <p>{description}</p>
        {destination ? (
          <Link href={destination.href} className="clinical-home-action">
            {destination.label}
            <ClinicalIcon name="arrow" />
          </Link>
        ) : null}
      </div>
      <div aria-hidden="true" className="clinical-workspace-plate">
        <ClinicalIcon name={icon} />
      </div>
    </section>
  );
}
