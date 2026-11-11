import { buildPolylinePoints, gridLines, type LeadScale } from "../../_lib/waveform-path";
import type { ViewWindow } from "../../_lib/viewport";

const VIEW_WIDTH = 1000;

interface LeadStripProps {
  samples: Float32Array;
  name: string;
  window: ViewWindow;
  scale: LeadScale;
  // Alto en unidades del dibujo; el alto real lo fija la clase CSS del contenedor.
  viewHeight: number;
  className: string;
}

// Una derivación: cuadrícula, trazo y nombre. El trazo y la cuadrícula usan solo tokens de color, así que se ven
// bien en claro y en oscuro, y el nombre está escrito, no codificado en el color. Es un componente sin estado.
export function LeadStrip({ samples, name, window, scale, viewHeight, className }: LeadStripProps) {
  const horizontalStep = window.span > 1 ? VIEW_WIDTH / (window.span - 1) : 0;
  const lines = gridLines(window);
  const points = buildPolylinePoints(samples, {
    start: window.start,
    span: window.span,
    width: VIEW_WIDTH,
    height: viewHeight,
    scale,
  });
  const seconds = window.span / 250;

  return (
    <div className={`relative overflow-hidden rounded-control border border-border bg-card ${className}`}>
      <svg
        role="img"
        aria-label={`Derivación ${name}, ${seconds.toLocaleString("es-AR", { maximumFractionDigits: 1 })} segundos`}
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={VIEW_WIDTH}
            y1={viewHeight * fraction}
            y2={viewHeight * fraction}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lines.map((line) => {
          const x = (line.sample - window.start) * horizontalStep;

          return (
            <line
              key={line.sample}
              x1={x}
              x2={x}
              y1={0}
              y2={viewHeight}
              className={line.major ? "stroke-muted/50" : "stroke-border"}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <polyline
          points={points}
          fill="none"
          className="stroke-foreground"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1 top-1 rounded-control bg-card/80 px-1.5 text-sm font-semibold font-label"
      >
        {name}
      </span>
    </div>
  );
}
