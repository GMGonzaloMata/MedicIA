import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { canInvite } from "@/modules/users/domain/invitation-access";

import { requireClinicContext } from "../../_lib/access";
import { toInvitationActor } from "../../_lib/invitation-actor";
import { InviteForm } from "../_invitations/_components/invite-form";

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

  // El médico invitará pacientes (próxima etapa); invitar médicos es solo del administrador.
  if (!canInvite(actor, "DOCTOR")) {
    return (
      <p className="max-w-prose text-base text-muted">
        Los médicos invitan pacientes a la clínica. Esa opción todavía no está disponible. Invitar médicos lo hace el
        administrador de la clínica.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-base text-muted">
        Invitá a un médico a unirse a tu clínica. Le enviamos un correo con un link: la persona tiene que ingresar con ese
        correo y escribir la matrícula que cargues acá.
      </p>
      <InviteForm />
    </div>
  );
}
