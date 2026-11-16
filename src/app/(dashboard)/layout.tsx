import { ClinicHeader } from "./_components/clinic-header";

// Estructura común de las pantallas protegidas. No lee la sesión en el nivel superior: el encabezado
// y cada pantalla la leen dentro de su propio <Suspense>, para que el resto de la página no espere.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="dashboard-shell">
      <ClinicHeader />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
