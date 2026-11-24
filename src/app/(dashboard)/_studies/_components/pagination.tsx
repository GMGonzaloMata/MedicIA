import Link from "next/link";

import { compactSecondaryButtonClassName } from "@/components/form/button-styles";

interface PaginationProps {
  page: number;
  totalPages: number;
  // Ruta de la pantalla; se le agrega `?page=N`.
  basePath: string;
  // Parámetros que se conservan al cambiar de página (búsqueda, filtro, orden).
  params?: Record<string, string>;
}

function pageHref(basePath: string, params: Record<string, string>, page: number): string {
  return `${basePath}?${new URLSearchParams({ ...params, page: String(page) }).toString()}`;
}

// Navegación entre páginas con enlaces, para que funcione sin JavaScript y la página quede en la dirección.
export function Pagination({ page, totalPages, basePath, params = {} }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={pageHref(basePath, params, page - 1)} className={compactSecondaryButtonClassName}>
            Anterior
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={pageHref(basePath, params, page + 1)} className={compactSecondaryButtonClassName}>
            Siguiente
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
