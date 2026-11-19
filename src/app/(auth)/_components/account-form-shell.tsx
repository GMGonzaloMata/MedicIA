import type { ReactNode } from "react";

export function AccountFormShell({ children }: { children: ReactNode }) {
  return (
    <section className="medicia-account-shell medicia-enter-screen">
      <div className="medicia-account-sheet">
        <p className="medicia-account-brand">Medic<span>IA</span></p>
        {children}
      </div>
    </section>
  );
}
