"use client";

import Link from "next/link";
import { useActionState } from "react";

import { linkClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { requestPasswordReset } from "../_actions/request-password-reset";
import { ResetPasswordForm } from "./reset-password-form";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);

  // Tras pedir el código, la misma pantalla pasa al paso de la contraseña nueva.
  if (state?.status === "success" && state.values?.email) {
    return <ResetPasswordForm initialEmail={state.values.email} introMessage={state.message} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        {state?.status === "error" && state.message ? (
          <FormMessage tone="error">{state.message}</FormMessage>
        ) : null}
        <FormField
          id="email"
          name="email"
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={state?.values?.email}
          errors={state?.fieldErrors?.email}
        />
        <SubmitButton pendingLabel="Enviando…">Enviar código</SubmitButton>
      </form>
      <p className="text-sm">
        <Link href="/sign-in" className={linkClassName}>
          Volver a ingresar
        </Link>
      </p>
    </div>
  );
}
