import type { Metadata } from "next";
import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";

import { VerifyEmailForm } from "../_components/verify-email-form";

export const metadata: Metadata = { title: "Verificar correo" };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Verificar correo</h1>
      <p className="text-sm text-muted">
        Ingresá el código que te enviamos al registrarte. Si no te llegó o ya venció, pedí uno nuevo.
      </p>
      <VerifyEmailForm />
      <p className="text-sm">
        <Link href="/sign-in" className={linkClassName}>
          Volver a ingresar
        </Link>
      </p>
    </>
  );
}
