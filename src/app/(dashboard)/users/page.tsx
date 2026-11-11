import type { Metadata } from "next";
import { Suspense } from "react";

import { UsersContent } from "../_users/_components/users-content";

export const metadata: Metadata = { title: "Usuarios" };

export default function UsersPage({ searchParams }: PageProps<"/users">) {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Usuarios</h1>
      <Suspense fallback={<p className="text-muted">Cargando usuarios…</p>}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
