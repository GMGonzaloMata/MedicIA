// Muestra el código de vinculación en claro. Existe solo en la respuesta de la acción que lo generó: no se guarda
// ni se puede volver a ver, y el aviso lo dice.
export function LinkCodeNotice({ code }: { code: string }) {
  return (
    <div role="status" className="flex flex-col gap-2 rounded-control border-2 border-primary bg-elevated px-4 py-3">
      <p className="text-sm font-medium text-foreground">Código de vinculación</p>
      <p className="select-all font-mono text-2xl font-semibold tracking-widest text-foreground">{code}</p>
      <p className="text-sm text-foreground">
        Anotalo y entregáselo al paciente ahora. No se puede volver a ver: si se pierde, generá uno nuevo. Sirve una
        sola vez y vence a los 7 días.
      </p>
    </div>
  );
}
