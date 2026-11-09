"use client";

import Link from "next/link";
import { useActionState } from "react";

import { linkClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";

import { signIn } from "../_actions/sign-in";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, undefined);

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
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
        <FormField
          id="password"
          name="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          errors={state?.fieldErrors?.password}
        />
        <SubmitButton pendingLabel="Ingresando…">Ingresar</SubmitButton>
      </form>
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <Link href="/forgot-password" className={linkClassName}>
            ¿Olvidaste tu contraseña?
          </Link>
        </li>
        <li>
          <Link href="/sign-up" className={linkClassName}>
            Crear una cuenta
          </Link>
        </li>
        <li>
          {/* Siempre visible, para todas las cuentas, así no se revela cuáles están sin verificar. */}
          <Link href="/verify-email" className={linkClassName}>
            ¿No verificaste tu correo?
          </Link>
        </li>
      </ul>
    </div>
  );
}
