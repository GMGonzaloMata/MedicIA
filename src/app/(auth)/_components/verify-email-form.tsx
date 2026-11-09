"use client";

import { useActionState } from "react";

import { secondaryButtonClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { VERIFICATION_CODE_LENGTH } from "@/modules/users/application/validation/account-form-schemas";

import { confirmAccount } from "../_actions/confirm-account";
import { resendConfirmationCode } from "../_actions/resend-confirmation-code";

interface VerifyEmailFormProps {
  // Con el correo ya conocido (viene del registro) no se vuelve a pedir.
  initialEmail?: string;
  introMessage?: string;
}

export function VerifyEmailForm({ initialEmail, introMessage }: VerifyEmailFormProps) {
  const [confirmState, confirmAction] = useActionState(confirmAccount, undefined);
  const [resendState, resendAction, isResending] = useActionState(resendConfirmationCode, undefined);

  const email = initialEmail ?? confirmState?.values?.email ?? resendState?.values?.email;
  const failure = confirmState?.status === "error" ? confirmState : undefined;
  const resendFailure = resendState?.status === "error" ? resendState : undefined;
  const resendSuccess = resendState?.status === "success" ? resendState : undefined;

  return (
    <form action={confirmAction} className="flex flex-col gap-4">
      {introMessage && !resendSuccess ? <FormMessage tone="success">{introMessage}</FormMessage> : null}
      {resendSuccess?.message ? <FormMessage tone="success">{resendSuccess.message}</FormMessage> : null}
      {failure?.message ? <FormMessage tone="error">{failure.message}</FormMessage> : null}
      {resendFailure?.message ? <FormMessage tone="error">{resendFailure.message}</FormMessage> : null}
      <FormField
        id="email"
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={email}
        isReadOnly={initialEmail !== undefined}
        errors={failure?.fieldErrors?.email ?? resendFailure?.fieldErrors?.email}
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
      <SubmitButton pendingLabel="Verificando…">Verificar correo</SubmitButton>
      {/* Pide un código nuevo sin exigir el código actual (por eso omite la validación nativa). */}
      <button
        type="submit"
        formAction={resendAction}
        formNoValidate
        disabled={isResending}
        className={secondaryButtonClassName}
      >
        {isResending ? "Enviando…" : "Reenviar el código"}
      </button>
    </form>
  );
}
