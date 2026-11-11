import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";
import { getUsersModule } from "@/modules/users/composition";

import { requireClinicContext } from "@/app/_lib/access";
import { toClinicUserActor } from "@/app/_lib/clinic-user-actor";

import { Pagination } from "./pagination";
import { PatientsTable } from "./patients-table";
import { StaffTable } from "./staff-table";
import { UsersTabs, type UsersTab } from "./users-tabs";
import { USER_MESSAGES } from "../_lib/user-messages";

interface UsersQuery {
  tab?: string | string[];
  page?: string | string[];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function EmptyState({ tab, hasOtherPages }: { tab: UsersTab; hasOtherPages: boolean }) {
  if (hasOtherPages) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base text-muted">{USER_MESSAGES.emptyPage}</p>
        <Link href={`/users?tab=${tab}&page=1`} className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Ir a la primera página
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-5">
      <p className="text-base text-muted">{tab === "staff" ? USER_MESSAGES.emptyStaff : USER_MESSAGES.emptyPatients}</p>
      <Link href="/users/new" className={`${linkClassName} inline-flex min-h-11 items-center`}>
        Dar de alta a una persona
      </Link>
    </div>
  );
}

export async function UsersContent({ searchParams }: { searchParams: Promise<UsersQuery> }) {
  const context = await requireClinicContext();
  const actor = toClinicUserActor(context);
  if (!actor?.isClinicAdmin) {
    return <p role="alert" className="text-base">{USER_MESSAGES.forbidden}</p>;
  }

  const query = await searchParams;
  const tab: UsersTab = first(query.tab) === "patients" ? "patients" : "staff";
  const page = Number(first(query.page));
  const users = getUsersModule();
  const listing = tab === "staff"
    ? { tab: "staff" as const, result: await users.listClinicStaff({ actor, page }) }
    : { tab: "patients" as const, result: await users.listClinicPatients({ actor, page }) };
  if (listing.result.status === "FORBIDDEN") {
    return <p role="alert" className="text-base">{USER_MESSAGES.forbidden}</p>;
  }
  const { result } = listing;
  const table = listing.tab === "staff"
    ? listing.result.status === "OK" ? <StaffTable members={listing.result.items} /> : null
    : listing.result.status === "OK" ? <PatientsTable patients={listing.result.items} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-base text-muted">Personas de <strong className="text-foreground">{context.clinic.tenantName}</strong>. Consultá sus roles, estados y asignaciones.</p>
      <p><Link href="/users/new" className={`${linkClassName} inline-flex min-h-11 items-center`}>Dar de alta a una persona</Link></p>
      <UsersTabs active={tab} />
      <section aria-label={tab === "staff" ? "Personal" : "Pacientes"} className="flex flex-col gap-4">
        {result.items.length === 0 ? (
          <EmptyState tab={tab} hasOtherPages={result.total > 0} />
        ) : (
          table
        )}
        <Pagination tab={tab} page={result.page} total={result.total} pageSize={result.pageSize} />
      </section>
    </div>
  );
}
