"use client";

import { useActionState, useState } from "react";

import { primaryButtonClassName, secondaryButtonClassName } from "@/components/form/button-styles";
import { FormField } from "@/components/form/form-field";
import { FormMessage } from "@/components/form/form-message";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_POLICY_HINT,
  VERIFICATION_CODE_LENGTH,
} from "@/modules/users/application/validation/account-form-schemas";

import { confirmAccount } from "../_actions/confirm-account";
import { resendConfirmationCode } from "../_actions/resend-confirmation-code";

interface VerifyEmailFormProps {
  // Con el correo ya conocido (viene del registro) no se vuelve a pedir.
  initialEmail?: string;
  introMessage?: string;
}

export function VerifyEmailForm({ initialEmail, introMessage }: VerifyEmailFormProps) {
  const [confirmState, confirmAction, isConfirming] = useActionState(confirmAccount, undefined);
  const [resendState, resendAction, isResending] = useActionState(resendConfirmationCode, undefined);
  // Solo se muestra el resultado de lo último que hizo la persona, para no mezclar un error
  // de código con un aviso de reenvío (o al revés).
  const [lastAction, setLastAction] = useState<"confirm" | "resend">("confirm");

  const email = initialEmail ?? confirmState?.values?.email ?? resendState?.values?.email;
  const failure = lastAction === "confirm" && confirmState?.status === "error" ? confirmState : undefined;
  const resendFailure = lastAction === "resend" && resendState?.status === "error" ? resendState : undefined;
  const resendSuccess = lastAction === "resend" && resendState?.status === "success" ? resendState : undefined;

  return (
    <form action={confirmAction} className="flex flex-col gap-4">
      {introMessage && !resendSuccess && !failure ? (
        <FormMessage tone="success">{introMessage}</FormMessage>
      ) : null}
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
      {/* La contraseña se elige acá, con el código, para que la defina quien tiene el correo (R18). */}
      <FormField
        id="password"
        name="password"
        label="Elegí tu contraseña"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        hint={`Con esta contraseña vas a ingresar. ${PASSWORD_POLICY_HINT}`}
        errors={failure?.fieldErrors?.password}
      />
      <FormField
        id="passwordConfirmation"
        name="passwordConfirmation"
        label="Repetí tu contraseña"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        errors={failure?.fieldErrors?.passwordConfirmation}
      />
      {/* No usa SubmitButton: este formulario tiene dos envíos y solo debe mostrarse "Verificando…" al verificar. */}
      <button
        type="submit"
        disabled={isConfirming}
        onClick={() => setLastAction("confirm")}
        className={primaryButtonClassName}
      >
        {isConfirming ? "Verificando…" : "Verificar correo"}
      </button>
      {/* Pide un código nuevo sin exigir el código actual (por eso omite la validación nativa). */}
      <button
        type="submit"
        formAction={resendAction}
        formNoValidate
        disabled={isResending}
        onClick={() => setLastAction("resend")}
        className={secondaryButtonClassName}
      >
        {isResending ? "Enviando…" : "Reenviar el código"}
      </button>
    </form>
  );
}
