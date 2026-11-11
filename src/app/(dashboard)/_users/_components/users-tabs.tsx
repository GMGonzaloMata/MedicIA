import Link from "next/link";

export type UsersTab = "staff" | "patients";

export function UsersTabs({ active }: { active: UsersTab }) {
  const tabs = [
    { id: "staff", label: "Personal" },
    { id: "patients", label: "Pacientes" },
  ] as const;

  return (
    <nav aria-label="Secciones de usuarios" className="flex gap-2 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/users?tab=${tab.id}&page=1`}
          aria-current={active === tab.id ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            active === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
