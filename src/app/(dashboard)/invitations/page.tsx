import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { INVITATION_KINDS } from "@/modules/users/domain/invitation";
import { getUsersModule } from "@/modules/users/composition";
import { canInvite, canSeeAllInvitations } from "@/modules/users/domain/invitation-access";

import { requireClinicContext } from "../../_lib/access";
import { toInvitationActor } from "../../_lib/invitation-actor";
import { InviteForm } from "../_invitations/_components/invite-form";
import { PendingInvitations } from "../_invitations/_components/pending-invitations";

export const metadata: Metadata = { title: "Invitaciones" };

export default function InvitationsPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Invitaciones</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <InvitationsContent />
      </Suspense>
    </>
  );
}

async function InvitationsContent() {
  const actor = toInvitationActor(await requireClinicContext());

  // Solo invitan el administrador y el médico: el resto vuelve al inicio, como en «Mis pacientes».
  if (!actor) {
    redirect("/");
  }

  // El administrador invita médicos y pacientes; quien solo es médico, solo pacientes.
  const kinds = INVITATION_KINDS.filter((kind) => canInvite(actor, kind));
  const pending = await getUsersModule().listInvitations({ actor });
  const document = kinds.length === 1 ? "su documento" : "la matrícula o el documento que cargues acá";

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-base text-muted">
        Invitá a una persona a unirse a tu clínica. Le enviamos un correo con un link: tiene que ingresar con ese correo y
        escribir {document}.
      </p>
      <InviteForm kinds={kinds} />
      <section aria-labelledby="pending-title" className="flex flex-col gap-3">
        <h2 id="pending-title" className="text-xl font-semibold">
          Invitaciones pendientes
        </h2>
        <PendingInvitations invitations={pending} showCreator={canSeeAllInvitations(actor)} />
      </section>
    </div>
  );
}
