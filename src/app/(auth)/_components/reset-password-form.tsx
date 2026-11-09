"use client";

import { useActionState } from "react";

import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_POLICY_HINT,
  VERIFICATION_CODE_LENGTH,
} from "@/modules/users/application/validation/account-form-schemas";

import { resetPassword } from "../_actions/reset-password";

interface ResetPasswordFormProps {
  // Con el correo ya conocido (viene del paso anterior) no se vuelve a pedir.
  initialEmail?: string;
  introMessage?: string;
}

export function ResetPasswordForm({ initialEmail, introMessage }: ResetPasswordFormProps) {
  const [state, action] = useActionState(resetPassword, undefined);
  const failure = state?.status === "error" ? state : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      {introMessage && !failure ? <FormMessage tone="success">{introMessage}</FormMessage> : null}
      {failure?.message ? <FormMessage tone="error">{failure.message}</FormMessage> : null}
      <FormField
        id="email"
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={initialEmail ?? state?.values?.email}
        isReadOnly={initialEmail !== undefined}
        errors={failure?.fieldErrors?.email}
      />
      <FormField
        id="code"
        name="code"
        label="Código de verificación"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={VERIFICATION_CODE_LENGTH}
        hint={`Son ${VERIFICATION_CODE_LENGTH} dígitos y llegan a tu correo.`}
        errors={failure?.fieldErrors?.code}
      />
      <FormField
        id="newPassword"
        name="newPassword"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        hint={PASSWORD_POLICY_HINT}
        errors={failure?.fieldErrors?.newPassword}
      />
      <SubmitButton pendingLabel="Cambiando…">Cambiar contraseña</SubmitButton>
    </form>
  );
}
