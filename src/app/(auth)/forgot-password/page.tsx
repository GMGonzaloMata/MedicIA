import type { Metadata } from "next";

import { ForgotPasswordForm } from "../_components/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Recuperar contraseña</h1>
      <p className="text-sm text-muted">
        Ingresá tu correo y te enviamos un código para elegir una contraseña nueva.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
