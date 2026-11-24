import Link from "next/link";

export interface ViewTab {
  href: string;
  label: string;
  count: number;
  isCurrent: boolean;
}

// Pestañas como enlaces: funcionan sin JavaScript, se pueden compartir y marcan la actual con aria-current.
export function ViewTabs({ label, tabs }: { label: string; tabs: ViewTab[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 rounded-card bg-elevated p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.isCurrent ? "page" : undefined}
          className="relative inline-flex h-9 items-center gap-2 rounded-control px-3 text-sm font-semibold text-muted outline-offset-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_1px_2px_rgb(15_23_42/0.12)]"
        >
          {tab.label}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label text-xs tabular-nums text-primary">
            {tab.count}
          </span>
        </Link>
      ))}
    </nav>
  );
}
