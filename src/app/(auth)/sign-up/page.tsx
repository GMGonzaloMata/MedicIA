import type { Metadata } from "next";
import { Suspense } from "react";

import { InvitationNotice } from "../_components/invitation-notice";
import { SignUpForm } from "../_components/sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Crear cuenta</h1>
      <Suspense fallback={null}>
        <InvitationNotice />
      </Suspense>
      <p className="text-sm text-muted">
        Con tu cuenta vas a poder ingresar a las clínicas que te inviten. Te pedimos el correo para
        verificar que es tuyo. La contraseña la elegís en el paso siguiente, con el código.
      </p>
      <SignUpForm />
    </>
  );
}
