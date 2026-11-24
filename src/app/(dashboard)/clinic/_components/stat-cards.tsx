import { ClinicalIcon } from "../../_components/clinical-icon";

export interface Stat {
  label: string;
  value: number;
  icon: Parameters<typeof ClinicalIcon>[0]["name"];
}

const countFormat = new Intl.NumberFormat("es-AR");

// Indicadores de la parte de arriba de una pantalla de administración.
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
