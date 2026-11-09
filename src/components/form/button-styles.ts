const BASE =
  "inline-flex min-h-11 items-center justify-center rounded-control px-4 text-base font-semibold outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";

export const primaryButtonClassName = `${BASE} bg-primary text-primary-foreground hover:bg-primary-hover`;

export const secondaryButtonClassName = `${BASE} border border-input-border bg-card text-foreground hover:bg-elevated`;

// Enlace de texto que se distingue por el subrayado y no solo por el color.
export const linkClassName =
  "rounded-control font-medium text-primary underline underline-offset-4 outline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-ring";
