import type { Metadata } from "next";
import { Suspense } from "react";

import { getTenantsModule } from "@/modules/tenants/composition";

import { requireClinicContext } from "../../../_lib/access";
import { toClinicAdminActor } from "../../../_lib/clinic-admin-actor";
import { InviteStaffForm } from "../_components/invite-staff-form";
import { MembersList, PendingInvitationsList } from "../_components/staff-lists";
import { CLINIC_MESSAGES } from "../_lib/clinic-messages";

export const metadata: Metadata = { title: "Personal de la clínica" };

export default function ClinicStaffPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">Personal de la clínica</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <StaffContent />
      </Suspense>
    </>
  );
}

async function StaffContent() {
  const actor = toClinicAdminActor(await requireClinicContext());

  // Solo administra quien tiene el rol de administrador.
  if (!actor) {
    return <p className="text-base">{CLINIC_MESSAGES.forbidden}</p>;
  }

  const { members, invitations } = await getTenantsModule().listStaff({ actor });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="invite-title" className="flex flex-col gap-4">
        <h2 id="invite-title" className="text-xl font-semibold">Invitar a una persona</h2>
        <InviteStaffForm />
      </section>
      <section aria-labelledby="pending-title" className="flex flex-col gap-4">
        <h2 id="pending-title" className="text-xl font-semibold">Invitaciones pendientes</h2>
        <PendingInvitationsList invitations={invitations} />
      </section>
      <section aria-labelledby="members-title" className="flex flex-col gap-4">
        <h2 id="members-title" className="text-xl font-semibold">Personal</h2>
        <MembersList members={members} />
      </section>
    </div>
  );
}
