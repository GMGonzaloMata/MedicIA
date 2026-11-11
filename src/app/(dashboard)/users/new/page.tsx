import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { linkClassName } from "@/components/form/button-styles";
import { canInvite } from "@/modules/users/domain/invitation-access";
import { INVITATION_KINDS } from "@/modules/users/domain/invitation";

import { requireClinicContext } from "../../../_lib/access";
import { toClinicUserActor } from "../../../_lib/clinic-user-actor";
import { EnrollForm } from "../../_users/_components/enroll-form";

export const metadata: Metadata = { title: "Dar de alta" };

export default function NewUserPage() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando…</p>}>
      <NewUserContent />
    </Suspense>
  );
}

async function NewUserContent() {
  const actor = toClinicUserActor(await requireClinicContext());
  if (!actor) redirect("/");
  const kinds = INVITATION_KINDS.filter((kind) => canInvite(actor, kind));
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Dar de alta a una persona</h1>
      <p className="max-w-prose text-base text-muted">
        La persona queda vinculada a la clínica. Le enviaremos un aviso para que pueda ingresar.
      </p>
      <EnrollForm kinds={kinds} />
      <p><Link href={actor.isClinicAdmin ? "/users" : "/patients"} className={linkClassName}>Volver</Link></p>
    </div>
  );
}
