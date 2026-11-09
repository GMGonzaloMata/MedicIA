import { ClinicHeader } from "./_components/clinic-header";

// Estructura común de las pantallas protegidas. No lee la sesión en el nivel superior: el encabezado
// y cada pantalla la leen dentro de su propio <Suspense>, para que el resto de la página no espere.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <ClinicHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">{children}</main>
    </>
  );
}
