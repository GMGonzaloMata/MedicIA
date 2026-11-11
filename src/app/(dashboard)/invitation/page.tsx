import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { primaryButtonClassName } from "@/components/form/button-styles";
import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../_lib/access";
import { readInvitationToken } from "../../_lib/invitation-cookie";
import { SignOutButton } from "../_components/sign-out-button";
import { dismissInvitation } from "../_invitations/_actions/dismiss-invitation";
import { AcceptInvitationForm } from "../_invitations/_components/accept-invitation-form";
import { INVITATION_MESSAGES, invitedAsMessage } from "../_invitations/_lib/invitation-messages";

export const metadata: Metadata = { title: "Invitación" };

export default function InvitationPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Invitación</h1>
      {/* Leer la sesión y la cookie ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <InvitationContent />
      </Suspense>
    </>
  );
}

// Un solo mensaje para cualquier link que no sirve, sin revelar la clínica ni el tipo (FR-024).
function InvalidInvitation({ withSignOut }: { withSignOut: boolean }) {
  return (
    <div className="flex max-w-md flex-col gap-4 text-base">
      <p>{INVITATION_MESSAGES.invalidLink}</p>
      {withSignOut ? <p className="text-muted">{INVITATION_MESSAGES.otherEmailHint}</p> : null}
      <div className="flex flex-wrap gap-3">
        <form action={dismissInvitation}>
          <button type="submit" className={primaryButtonClassName}>
            Ir al inicio
          </button>
        </form>
        {withSignOut ? <SignOutButton /> : null}
      </div>
    </div>
  );
}

// Acepta una cuenta con o sin clínica activa: quien recién se registra todavía no tiene ninguna.
async function InvitationContent() {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  const token = await readInvitationToken();

  if (!token) {
    return <InvalidInvitation withSignOut={false} />;
  }

  const preview = await getUsersModule().previewInvitation({
    token,
    account: { id: context.user.id, email: context.user.email },
  });

  if (preview.status === "INVALID") {
    return <InvalidInvitation withSignOut />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{invitedAsMessage(preview.tenantName, preview.kind)}</h2>
      <AcceptInvitationForm kind={preview.kind} />
    </div>
  );
}
