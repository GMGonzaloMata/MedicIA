import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute } from "react";

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  type?: Extract<HTMLInputTypeAttribute, "text" | "email" | "password">;
  autoComplete?: HTMLInputAutoCompleteAttribute;
  inputMode?: "text" | "email" | "numeric";
  defaultValue?: string;
  hint?: string;
  errors?: string[];
  maxLength?: number;
  isRequired?: boolean;
  isReadOnly?: boolean;
}

function ErrorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="currentColor">
      <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-.75 4.25a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5ZM10 14a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
    </svg>
  );
}

// Campo con etiqueta, ayuda y error. El error se comunica con ícono y texto, no solo con color,
// y queda asociado al campo para los lectores de pantalla.
export function FormField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  inputMode,
  defaultValue,
  hint,
  errors,
  maxLength,
  isRequired = true,
  isReadOnly = false,
}: FormFieldProps) {
  const hasErrors = errors !== undefined && errors.length > 0;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, hasErrors ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-label text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        defaultValue={defaultValue}
        maxLength={maxLength}
        required={isRequired}
        readOnly={isReadOnly}
        aria-invalid={hasErrors || undefined}
        aria-describedby={describedBy || undefined}
        className="min-h-11 w-full rounded-control border border-input-border bg-card px-3 text-base text-foreground outline-offset-2 read-only:bg-elevated focus-visible:outline-2 focus-visible:outline-ring aria-[invalid=true]:border-danger"
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {hasErrors ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
          <ErrorIcon />
          <span>{errors.join(" ")}</span>
        </p>
      ) : null}
    </div>
  );
}
