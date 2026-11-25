import type { Metadata } from "next";
import { Suspense } from "react";

import { getTenantsModule } from "@/modules/tenants/composition";

import { requireClinicContext } from "../../../_lib/access";
import { toClinicAdminActor } from "../../../_lib/clinic-admin-actor";
import { StatCards } from "../_components/stat-cards";
import { InviteStaffForm } from "../_components/invite-staff-form";
import { ModalDialog } from "../_components/modal-dialog";
import { ViewTabs } from "../_components/view-tabs";
import { MembersList, PendingInvitationsList } from "../_components/staff-lists";
import { CLINIC_MESSAGES } from "../_lib/clinic-messages";

export const metadata: Metadata = { title: "Personal de la clínica" };

export default function ClinicStaffPage({ searchParams }: PageProps<"/clinic/staff">) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="clinical-page-title">Personal de la clínica</h1>
        <p className="clinical-page-lead">
          Invitá a médicos y administradores, y controlá quién tiene acceso a la clínica.
        </p>
      </header>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <StaffContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type StaffView = "members" | "invitations";

async function StaffContent({ searchParams }: { searchParams: PageProps<"/clinic/staff">["searchParams"] }) {
  const actor = toClinicAdminActor(await requireClinicContext());

  // Solo administra quien tiene el rol de administrador.
  if (!actor) {
    return <p className="text-base">{CLINIC_MESSAGES.forbidden}</p>;
  }

  const { members, invitations } = await getTenantsModule().listStaff({ actor });

  const active = members.filter((member) => member.status === "ACTIVE");
  const pending = invitations.filter((invitation) => invitation.state !== "expired");
  // Las invitaciones van en su propia pestaña: con mucho personal, al final de la lista quedarían escondidas.
  const view: StaffView = (await searchParams).vista === "invitaciones" ? "invitations" : "members";

  return (
    <div className="flex flex-col gap-6">
      <StatCards
        stats={[
          { label: "Personal activo", value: active.length, icon: "clinic" },
          { label: "Médicos", value: active.filter((member) => member.roles.isDoctor).length, icon: "patients" },
          { label: "Administradores", value: active.filter((member) => member.roles.isClinicAdmin).length, icon: "home" },
          {
            label: "Invitaciones pendientes",
            value: pending.length,
            icon: "mail",
          },
        ]}
      />
      <section
        aria-labelledby="staff-view-title"
        className="overflow-hidden rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]"
      >
        <h2 id="staff-view-title" className="sr-only">
          {view === "members" ? "Personal" : "Invitaciones pendientes"}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <ViewTabs
            label="Secciones del personal"
            tabs={[
              { href: "/clinic/staff", label: "Personal", count: members.length, isCurrent: view === "members" },
              {
                href: "/clinic/staff?vista=invitaciones",
                label: "Invitaciones pendientes",
                count: invitations.length,
                isCurrent: view === "invitations",
              },
            ]}
          />
          <ModalDialog
            triggerLabel="Invitar personal"
            title="Invitar personal"
            description="Le llega un correo con un enlace para unirse a la clínica. Vence a los 7 días y sirve una sola vez."
          >
            <InviteStaffForm />
          </ModalDialog>
        </div>
        {view === "members" ? (
          <MembersList members={members} />
        ) : (
          <PendingInvitationsList invitations={invitations} />
        )}
      </section>
    </div>
  );
}
