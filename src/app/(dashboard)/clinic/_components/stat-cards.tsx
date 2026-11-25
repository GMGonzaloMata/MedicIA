import { ClinicalIcon } from "../../_components/clinical-icon";

export interface Stat {
  label: string;
  value: number;
  icon: Parameters<typeof ClinicalIcon>[0]["name"];
}

const countFormat = new Intl.NumberFormat("es-AR");

// Con tres indicadores cada uno ocupa un tercio del ancho; con cuatro, dos por fila en móvil y cuatro en escritorio.
const COLUMNS = {
  // En móvil van en una fila, sin ícono y con el número arriba, para no ocupar media pantalla.
  3: "grid grid-cols-3 gap-2 sm:gap-3 max-sm:[&>div]:flex-col max-sm:[&>div]:items-start max-sm:[&>div]:p-3 max-sm:[&>div>span]:hidden",
  4: "grid grid-cols-2 gap-3 lg:grid-cols-4",
} as const;

// Indicadores de la parte de arriba de una pantalla.
export function StatCards({ stats, columns = 4 }: { stats: Stat[]; columns?: keyof typeof COLUMNS }) {
  return (
    <dl className={COLUMNS[columns]}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-3 rounded-panel border border-border bg-card p-4 shadow-[0_1px_2px_rgb(15_23_42/0.05)]"
        >
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/10 text-primary">
            <ClinicalIcon name={stat.icon} />
          </span>
          <div className="flex min-w-0 flex-col">
            <dd className="font-sans text-2xl font-extrabold leading-tight tracking-tight tabular-nums">
              {countFormat.format(stat.value)}
            </dd>
            <dt className="text-xs font-medium leading-snug text-muted">{stat.label}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
