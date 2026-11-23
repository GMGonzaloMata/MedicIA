import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getAccessContext } from "../../../_lib/access";
import { AcceptInvitationForm } from "./_components/accept-invitation-form";

// El token viaja en la ruta: que no salga en el encabezado Referer hacia otros sitios.
export const metadata: Metadata = { title: "Invitación a una clínica", referrer: "no-referrer" };

export default function InvitationPage({ params }: PageProps<"/invitation/[token]">) {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">Invitación a una clínica</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <InvitationContent params={params} />
      </Suspense>
    </>
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
    <div className="flex max-w-xl flex-col gap-4 text-base">
      <p>
        Te invitaron a sumarte al personal de una clínica. Si aceptás, vas a poder trabajar en ella con esta cuenta.
      </p>
      <p className="text-muted">
        La invitación solo sirve para la cuenta con el correo al que se envió. Si no coincide, pedí una nueva a quien
        administra la clínica.
      </p>
      <AcceptInvitationForm token={token} />
    </div>
  );
}
