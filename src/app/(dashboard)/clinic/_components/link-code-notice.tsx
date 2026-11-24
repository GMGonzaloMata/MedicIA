"use client";

import { useState } from "react";

import { compactSecondaryButtonClassName } from "@/components/form/button-styles";

// Muestra el código de vinculación en claro. Existe solo en la respuesta de la acción que lo generó: no se guarda
// ni se puede volver a ver, y el aviso lo dice.
export function LinkCodeNotice({ code }: { code: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
    } catch {
      // Sin permiso para el portapapeles el código sigue visible y se puede seleccionar a mano.
      setIsCopied(false);
    }
  };

  return (
    <div role="status" className="flex flex-col gap-3 rounded-card border border-primary/40 bg-primary/5 p-4">
      <p className="font-label text-xs font-semibold uppercase tracking-wider text-primary">Código de vinculación</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="select-all font-mono text-2xl font-semibold tracking-widest text-foreground">{code}</p>
        <button type="button" onClick={copy} className={compactSecondaryButtonClassName}>
          {isCopied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="text-sm leading-relaxed text-foreground">
        Anotalo y entregáselo al paciente ahora. No se puede volver a ver: si se pierde, generá uno nuevo. Sirve una
        sola vez y vence a los 7 días.
      </p>
    </div>
  );
}
