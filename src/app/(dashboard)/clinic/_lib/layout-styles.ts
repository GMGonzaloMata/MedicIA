// Estilos compartidos de las pantallas de administración de la clínica.
export const panelClassName =
  "flex flex-col gap-4 rounded-panel border border-border bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:p-6";

export const sectionTitleClassName = "text-lg font-bold tracking-tight";

export const listClassName =
  "flex flex-col divide-y divide-border overflow-hidden rounded-panel border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.05)]";

export const avatarClassName =
  "grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 font-label text-sm font-bold text-primary";

export type BadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-elevated text-muted",
  primary: "bg-primary/10 text-primary",
  info: "bg-info-surface text-info",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
};

// Insignia de estado o de rol. El significado siempre lo dice el texto: el color solo lo refuerza.
export function badgeClassName(tone: BadgeTone): string {
  return `inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 font-label text-xs font-semibold ${BADGE_TONES[tone]}`;
}

export { initialsOf } from "../../_lib/initials";
