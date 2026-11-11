import { gridLines } from "../../_lib/waveform-path";
import type { ViewWindow } from "../../_lib/viewport";

function formatSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1).replace(".", ",")} s`;
}

// Eje de tiempo en segundos al pie de la gráfica. Con la ventana completa rotula cada segundo; con zoom, cada 0,2 s.
export function TimeAxis({ window }: { window: ViewWindow }) {
  const lines = gridLines(window).filter((line) => line.major || window.span <= 625);
  const lastSample = window.start + window.span - 1;

  return (
    <div aria-hidden="true" className="relative h-6 font-label text-xs tabular-nums text-muted">
      {lines.map((line) => {
        const fraction = (line.sample - window.start) / (window.span - 1);
        const alignment = fraction < 0.03 ? "" : line.sample > lastSample - 20 ? "-translate-x-full" : "-translate-x-1/2";

        return (
          <span key={line.sample} className={`absolute top-1 ${alignment}`} style={{ left: `${fraction * 100}%` }}>
            {formatSeconds(line.seconds)}
          </span>
        );
      })}
    </div>
  );
}
