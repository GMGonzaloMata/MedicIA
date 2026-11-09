import type { Metadata } from "next";
import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";

import { ResetPasswordForm } from "../_components/reset-password-form";

export const metadata: Metadata = { title: "Contraseña nueva" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Contraseña nueva</h1>
      <p className="text-sm text-muted">Ingresá el código que te enviamos y elegí tu contraseña nueva.</p>
      <ResetPasswordForm />
      <p className="text-sm">
        <Link href="/sign-in" className={linkClassName}>
          Volver a ingresar
        </Link>
      </p>
    </>
  );
}
