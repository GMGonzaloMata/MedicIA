import localFont from "next/font/local";

import { ClinicHeader } from "./_components/clinic-header";
import "./dashboard.css";

const literata = localFont({
  src: [
    { path: "../(auth)/sign-in/fonts/literata-latin.woff2", weight: "200 900", style: "normal" },
    { path: "../(auth)/sign-in/fonts/literata-latin-italic.woff2", weight: "200 900", style: "italic" },
  ],
  display: "swap",
  fallback: ["Georgia", "serif"],
  variable: "--font-clinical-literata",
});

// Estructura común de las pantallas protegidas. No lee la sesión en el nivel superior: el encabezado
// y cada pantalla la leen dentro de su propio <Suspense>, para que el resto de la página no espere.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`dashboard-shell clinical-shell ${literata.variable}`}>
      <ClinicHeader />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
