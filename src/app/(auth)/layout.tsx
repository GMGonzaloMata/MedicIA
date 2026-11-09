// Estructura común de las pantallas de acceso: una tarjeta centrada que se adapta al ancho disponible.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center bg-panel px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-panel border border-border bg-card p-6 sm:p-8">
        <p className="font-label text-sm font-semibold text-primary">MedicIA</p>
        {children}
      </div>
    </main>
  );
}
