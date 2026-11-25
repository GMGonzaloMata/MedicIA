"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { compactPrimaryButtonClassName, compactSecondaryButtonClassName } from "@/components/form/button-styles";

interface ModalDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  children: ReactNode;
  // «primary» para la acción principal de la pantalla (con «+»); «secondary» para acciones de una fila.
  variant?: "primary" | "secondary";
  // Texto de la fila sobre la que actúa el botón, para que el lector de pantalla sepa a qué paciente se refiere.
  triggerDescribedBy?: string;
}

// Botón que abre un formulario en un diálogo modal nativo: el navegador atrapa el foco, lo devuelve al botón al
// cerrar y cierra con Escape. Cada apertura monta el contenido de nuevo y al cerrar se desmonta, así no quedan
// mensajes ni códigos de una vez anterior (un código de vinculación se muestra una sola vez).
export function ModalDialog({
  triggerLabel,
  title,
  description,
  children,
  variant = "primary",
  triggerDescribedBy,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openCount, setOpenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  // Se abre después de montar el contenido nuevo, para que el foco caiga en su primer campo.
  useEffect(() => {
    if (openCount > 0) {
      dialogRef.current?.showModal();
    }
  }, [openCount]);

  // Next oculta la página al navegar (<Activity>) sin desmontarla: si el diálogo sigue abierto, al volver queda su
  // fondo oscuro sobre la página. La limpieza corre al ocultarse y al desmontarse (guía preserving-ui-state).
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-describedby={triggerDescribedBy}
        onClick={() => {
          setIsOpen(true);
          setOpenCount((count) => count + 1);
        }}
        className={variant === "primary" ? compactPrimaryButtonClassName : compactSecondaryButtonClassName}
      >
        {variant === "primary" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        ) : null}
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setIsOpen(false)}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),34rem)] overflow-y-auto rounded-panel border border-border bg-card p-0 text-foreground shadow-[0_24px_64px_rgb(0_0_0/0.35)] backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
      >
        {/* El contenido existe solo mientras está abierto: al cerrar no queda ningún dato ni código en la página. */}
        {isOpen ? (
        <div className="relative flex flex-col gap-5 p-6">
          <header className="flex flex-col gap-1 pr-12">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">
              {title}
            </h2>
            <p id={descriptionId} className="text-sm leading-relaxed text-muted">
              {description}
            </p>
          </header>
          <div key={openCount}>{children}</div>
          {/* Va al final para que el primer foco sea el formulario; se ve arriba a la derecha. */}
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar ventana"
            className="absolute right-3 top-3 grid size-11 place-items-center rounded-control text-muted outline-offset-2 hover:bg-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        ) : null}
      </dialog>
    </>
  );
}
