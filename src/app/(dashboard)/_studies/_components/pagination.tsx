import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";

interface PaginationProps {
  page: number;
  totalPages: number;
  // Ruta de la pantalla; se le agrega `?page=N`.
  basePath: string;
}

// Navegación entre páginas con enlaces, para que funcione sin JavaScript y la página quede en la dirección.
export function Pagination({ page, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center gap-4">
      {page > 1 ? (
        <Link href={`${basePath}?page=${page - 1}`} className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Anterior
        </Link>
      ) : null}
      <p className="text-sm text-muted">
        Página {page} de {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={`${basePath}?page=${page + 1}`} className={`${linkClassName} inline-flex min-h-11 items-center`}>
          Siguiente
        </Link>
      ) : null}
    </nav>
  );
}
