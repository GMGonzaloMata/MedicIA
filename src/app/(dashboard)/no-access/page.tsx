import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { linkClassName } from "@/components/form/button-styles";
import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../_lib/access";
import { ClinicalIcon } from "../_components/clinical-icon";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-4 sm:py-12">
      <header className="flex flex-col gap-4">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-panel bg-primary/10 text-primary [&_svg]:size-7"
        >
          <ClinicalIcon name="clinic" />
        </span>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">
          Todavía no tenés acceso a una clínica
        </h1>
        <p className="max-w-xl text-base text-muted">
          Para usar MedicIA necesitás una invitación de una clínica. Pedísela a quien administra tu clínica.
        </p>
      </header>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <NoAccessContent />
      </Suspense>
    </div>
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
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 sm:grid-cols-2">
        <li className="flex flex-col gap-3 rounded-panel border border-border bg-card p-5">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-card bg-elevated text-primary">
            <ClinicalIcon name="mail" />
          </span>
          <h2 className="text-base font-bold">Recibiste una invitación</h2>
          <p className="text-sm leading-relaxed text-muted">
            Abrí el enlace del mensaje. Si todavía no tenés cuenta, registrate con ese mismo correo y volvé a abrir el
            enlace.
          </p>
        </li>
        <li className="flex flex-col gap-3 rounded-panel border border-border bg-card p-5">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-card bg-elevated text-primary">
            <ClinicalIcon name="patients" />
          </span>
          <h2 className="text-base font-bold">Sos paciente</h2>
          <p className="text-sm leading-relaxed text-muted">
            Si tu clínica te dio un código,{" "}
            <Link href="/link-patient" className={linkClassName}>
              vinculá tu cuenta con tu documento y ese código
            </Link>
            .
          </p>
        </li>
      </ul>
      <p className="text-sm text-muted">
        Si ya tenías acceso y ahora no lo ves, puede que ya no esté vigente. Consultalo con tu clínica.
      </p>
    </div>
  );
}
