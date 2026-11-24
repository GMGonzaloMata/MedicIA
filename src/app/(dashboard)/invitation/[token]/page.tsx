import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getAccessContext } from "../../../_lib/access";
import { ClinicalIcon } from "../../_components/clinical-icon";
import { AcceptInvitationForm } from "./_components/accept-invitation-form";

// El token viaja en la ruta: que no salga en el encabezado Referer hacia otros sitios.
export const metadata: Metadata = { title: "Invitación a una clínica", referrer: "no-referrer" };

export default function InvitationPage({ params }: PageProps<"/invitation/[token]">) {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-panel border border-border bg-card p-6 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:p-8">
      <header className="flex flex-col gap-4">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-panel bg-primary/10 text-primary [&_svg]:!size-7"
        >
          <ClinicalIcon name="clinic" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="font-label text-xs font-semibold uppercase tracking-wider text-primary">Invitación al personal</p>
          <h1 className="clinical-page-title">Invitación a una clínica</h1>
        </div>
      </header>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <InvitationContent params={params} />
      </Suspense>
    </section>
  );
}

async function InvitationContent({ params }: { params: PageProps<"/invitation/[token]">["params"] }) {
  const context = await getAccessContext();

  // Sin sesión, vuelve a este mismo enlace después de ingresar.
  if (context.status === "anonymous") {
    const { token } = await params;

    redirect(`/sign-in?next=${encodeURIComponent(`/invitation/${token}`)}`);
  }

  const { token } = await params;

  return (
    <div className="flex flex-col gap-5 text-base">
      <p className="leading-relaxed">
        Te invitaron a sumarte al personal de una clínica. Si aceptás, vas a poder trabajar en ella con esta cuenta.
      </p>
      <p className="flex items-start gap-3 rounded-card bg-info-surface p-4 text-sm leading-relaxed text-info [&_svg]:mt-0.5 [&_svg]:!size-5 [&_svg]:shrink-0">
        <ClinicalIcon name="info" />
        <span>
          La invitación solo sirve para la cuenta con el correo al que se envió. Si no coincide, pedí una nueva a quien
          administra la clínica.
        </span>
      </p>
      <AcceptInvitationForm token={token} />
    </div>
  );
}
