import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../_lib/access";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Todavía no tenés acceso a una clínica</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <NoAccessContent />
      </Suspense>
    </>
  );
}

async function NoAccessContent() {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  // Si apareció una clínica disponible (por ejemplo, una invitación aceptada), ya no corresponde esta pantalla.
  if (context.status === "ready") {
    redirect("/");
  }

  const clinics = await getUsersModule().listAvailableClinics(context.user.id);

  if (clinics.length > 0) {
    redirect("/select-clinic");
  }

  return (
    <div className="flex flex-col gap-3 text-base">
      <p>Para usar MedicIA necesitás una invitación de una clínica. Pedísela a quien administra tu clínica.</p>
      <p className="text-muted">
        Si ya tenías acceso y ahora no lo ves, puede que ya no esté vigente. Consultalo con tu clínica.
      </p>
    </div>
  );
}
