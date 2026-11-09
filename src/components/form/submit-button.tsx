"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { primaryButtonClassName } from "./button-styles";

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel: string;
}

// Botón de envío que se deshabilita y cambia de texto mientras el formulario se procesa.
export function SubmitButton({ children, pendingLabel }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={primaryButtonClassName}>
      {pending ? pendingLabel : children}
    </button>
  );
}
