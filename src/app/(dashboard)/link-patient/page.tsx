import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getAccessContext } from "../../_lib/access";
import { ClinicalIcon } from "../_components/clinical-icon";
import { LinkPatientForm } from "./_components/link-patient-form";

export const metadata: Metadata = { title: "Vincular mi cuenta" };

export default function LinkPatientPage() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-panel border border-border bg-card p-6 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:p-8">
      <header className="flex flex-col gap-4">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-panel bg-primary/10 text-primary [&_svg]:!size-7"
        >
          <ClinicalIcon name="patients" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="font-label text-xs font-semibold uppercase tracking-wider text-primary">Cuenta de paciente</p>
          <h1 className="clinical-page-title">Vincular mi cuenta</h1>
        </div>
      </header>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <LinkPatientContent />
      </Suspense>
    </section>
  );
}

// Sirve a quien todavía no tiene clínica y también a quien ya tiene y suma otra.
async function LinkPatientContent() {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in?next=%2Flink-patient");
  }

  return (
    <div className="flex flex-col gap-5 text-base">
      <p className="leading-relaxed">
        Si tu clínica te registró como paciente, ingresá tu documento y el código que te entregó para ver tus estudios
        con esta cuenta.
      </p>
      <LinkPatientForm />
    </div>
  );
}
