import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";

import type { UsersTab } from "./users-tabs";

interface PaginationProps {
  tab: UsersTab;
  page: number;
  total: number;
  pageSize: number;
}

export function Pagination({ tab, page, total, pageSize }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Paginación de usuarios" className="flex flex-wrap items-center gap-4">
      {page > 1 ? (
        <Link href={`/users?tab=${tab}&page=${page - 1}`} className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Anterior
        </Link>
      ) : null}
      <p className="text-sm text-muted">Página {page} de {totalPages}</p>
      {page < totalPages ? (
        <Link href={`/users?tab=${tab}&page=${page + 1}`} className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Siguiente
        </Link>
      ) : null}
    </nav>
  );
}
