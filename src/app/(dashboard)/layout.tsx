// Estructura común de las pantallas protegidas. No lee la sesión en el nivel superior: cada pantalla
// la lee dentro de su propio <Suspense>, para que el resto de la página no espere a la solicitud.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">{children}</main>
  );
}
