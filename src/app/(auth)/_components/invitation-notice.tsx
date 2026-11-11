import { readInvitationToken } from "../../_lib/invitation-cookie";

// Aviso para quien llegó desde el link de una invitación y todavía no ingresó: la invitación va dirigida a un
// correo, así que tiene que ingresar o crear la cuenta con ese mismo. Lee la cookie, por lo que va dentro de su
// propio `<Suspense>` y el resto de la pantalla sigue siendo estática.
export async function InvitationNotice() {
  if (!(await readInvitationToken())) {
    return null;
  }

  return (
    <p role="status" className="rounded-control border border-border bg-elevated px-3 py-2 text-sm text-foreground">
      Ingresá o creá tu cuenta con el correo al que llegó la invitación.
    </p>
  );
}
