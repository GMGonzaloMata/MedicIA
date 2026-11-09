"use client";

import Link from "next/link";
import { useActionState } from "react";

import { linkClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { FULL_NAME_MAX_LENGTH } from "@/modules/users/application/validation/account-form-schemas";

import { signUp } from "../_actions/sign-up";
import { VerifyEmailForm } from "./verify-email-form";

export function SignUpForm() {
  const [state, action] = useActionState(signUp, undefined);

  // Tras registrarse, la misma pantalla pasa al paso del código. El correo queda en el estado del
  // formulario y no en la URL.
  if (state?.status === "success" && state.values?.email) {
    return <VerifyEmailForm initialEmail={state.values.email} introMessage={state.message} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        {state?.status === "error" && state.message ? (
          <FormMessage tone="error">{state.message}</FormMessage>
        ) : null}
        <FormField
          id="fullName"
          name="fullName"
          label="Nombre completo"
          autoComplete="name"
          maxLength={FULL_NAME_MAX_LENGTH}
          defaultValue={state?.values?.fullName}
          errors={state?.fieldErrors?.fullName}
        />
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
        <SubmitButton pendingLabel="Enviando código…">Crear cuenta</SubmitButton>
      </form>
      <p className="text-sm text-muted">
        ¿Ya tenés una cuenta?{" "}
        <Link href="/sign-in" className={linkClassName}>
          Ingresar
        </Link>
      </p>
    </div>
  );
}
