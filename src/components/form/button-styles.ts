const BASE =
  "inline-flex min-h-11 items-center justify-center rounded-control px-4 text-base font-semibold outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";

export const primaryButtonClassName = `${BASE} bg-primary text-primary-foreground hover:bg-primary-hover`;

export const secondaryButtonClassName = `${BASE} border border-input-border bg-card text-foreground hover:bg-elevated`;

// Botones chicos para barras de herramientas y acciones de fila. Se ven compactos (36 px) pero el pseudo-elemento
// amplía el área táctil a 44 px, como pide memory/design.md.
const COMPACT =
  "relative inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3 text-sm font-semibold outline-offset-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";

export const compactPrimaryButtonClassName = `${COMPACT} bg-primary text-primary-foreground hover:bg-primary-hover`;

export const compactSecondaryButtonClassName = `${COMPACT} border border-border bg-transparent text-foreground hover:bg-elevated`;

// Para acciones que quitan acceso (desactivar, anular): el texto lo dice y el color lo refuerza.
export const compactDangerButtonClassName = `${COMPACT} border border-border bg-transparent text-danger hover:border-danger hover:bg-danger-surface`;

// Enlace de texto que se distingue por el subrayado y no solo por el color.
export const linkClassName =
  "rounded-control font-medium text-primary underline underline-offset-4 outline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-ring";
