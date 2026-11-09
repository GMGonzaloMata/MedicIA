import type { ReactNode } from "react";

interface FormMessageProps {
  tone: "error" | "success";
  children: ReactNode;
}

function Icon({ tone }: { tone: FormMessageProps["tone"] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="currentColor">
      {tone === "error" ? (
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-.75 4.25a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5ZM10 14a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      ) : (
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm3.78 6.72-4.5 5a.75.75 0 0 1-1.1.03l-2-2a.75.75 0 1 1 1.06-1.06l1.43 1.43 3.97-4.4a.75.75 0 0 1 1.14.99Z" />
      )}
    </svg>
  );
}

// Mensaje de un formulario completo. Los errores se anuncian de inmediato (`alert`) y los avisos
// de forma amable (`status`); ambos llevan ícono además del color.
export function FormMessage({ tone, children }: FormMessageProps) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-control border px-3 py-2 text-sm ${
        isError
          ? "border-danger bg-danger-surface text-danger"
          : "border-success bg-success-surface text-success"
      }`}
    >
      <Icon tone={tone} />
      <p>{children}</p>
    </div>
  );
}
