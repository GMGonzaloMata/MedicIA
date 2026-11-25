"use client";

import Link from "next/link";
import { useActionState } from "react";

import { linkClassName, secondaryButtonClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { signIn } from "../_actions/sign-in";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, undefined);

  return (
    <div className="medicia-login-form-stack">
      <form action={action} className="medicia-login-form">
        <input type="hidden" name="next" value={next} />
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
        <div className="medicia-login-password">
          <FormField
            id="password"
            name="password"
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            errors={state?.fieldErrors?.password}
          />
          <Link href="/forgot-password" className={`${linkClassName} medicia-login-forgot`}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <SubmitButton pendingLabel="Ingresando…">Ingresar</SubmitButton>
      </form>
      <div className="medicia-login-support">
        <p className="medicia-login-support-lead">¿Todavía no tenés cuenta?</p>
        <Link href="/sign-up" className={`${secondaryButtonClassName} medicia-login-create`}>
          Crear una cuenta
        </Link>
        {/* Siempre visible, para todas las cuentas, así no se revela cuáles están sin verificar. */}
        <Link href="/verify-email" className={`${linkClassName} medicia-login-verify`}>
          ¿No verificaste tu correo?
        </Link>
      </div>
    </div>
  );
}
