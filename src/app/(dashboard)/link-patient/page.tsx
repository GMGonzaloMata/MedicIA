import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getAccessContext } from "../../_lib/access";
import { LinkPatientForm } from "./_components/link-patient-form";

export const metadata: Metadata = { title: "Vincular mi cuenta" };

export default function LinkPatientPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">Vincular mi cuenta</h1>
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <LinkPatientContent />
      </Suspense>
    </>
  );
}

// Sirve a quien todavía no tiene clínica y también a quien ya tiene y suma otra.
async function LinkPatientContent() {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-4 text-base">
      <p className="max-w-xl">
        Si tu clínica te registró como paciente, ingresá tu documento y el código que te entregó para ver tus estudios
        con esta cuenta.
      </p>
      <LinkPatientForm />
    </div>
  );
}
