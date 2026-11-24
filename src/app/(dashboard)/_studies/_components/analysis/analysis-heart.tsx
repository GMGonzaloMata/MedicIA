import type { ReactNode } from "react";

// Ilustración decorativa del corazón para el resultado. Son tres capas SVG a distinta profundidad que giran apenas y
// laten, así se ve con volumen. No depende del valor: la forma, el color y el movimiento son siempre los mismos.
// Con «reducir movimiento» queda quieta.

const BODY_GRADIENT = "heart-body-gradient";
const LOBE_GRADIENT = "heart-lobe-gradient";
const GLOSS_GRADIENT = "heart-gloss-gradient";

const primary = { stopColor: "var(--primary)" };
const light = { stopColor: "white" };

function Tube({ d, width }: { d: string; width: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="var(--primary)" strokeOpacity={0.6} strokeWidth={width} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="white"
        strokeOpacity={0.35}
        strokeWidth={Math.max(2, width / 4)}
        strokeLinecap="round"
        transform={`translate(${-width / 4} 0)`}
      />
    </>
  );
}

function Layer({ depth, children }: { depth: "back" | "middle" | "front"; children: ReactNode }) {
  // La perspectiva agranda lo que está adelante: la escala lo compensa para que las capas coincidan en reposo.
  const transform = {
    back: "[transform:translateZ(-28px)_scale(1.035)]",
    middle: "",
    front: "[transform:translateZ(28px)_scale(0.965)]",
  }[depth];

  return (
    <svg viewBox="0 0 200 230" className={`absolute inset-0 size-full overflow-visible ${transform}`}>
      {children}
    </svg>
  );
}

export function AnalysisHeart() {
  return (
    <div aria-hidden="true" className="relative h-56 w-48 shrink-0 [perspective:800px] sm:h-64 sm:w-56">
      <div className="absolute inset-8 animate-heart-glow rounded-full bg-primary/30 blur-2xl motion-reduce:animate-none" />
      <div className="absolute inset-x-12 -bottom-1 h-3 rounded-full bg-primary/25 blur-md" />
      <div className="relative size-full animate-heart-sway [transform-style:preserve-3d] motion-reduce:animate-none">
        <div className="relative size-full origin-[55%_60%] animate-heart-beat [transform-style:preserve-3d] motion-reduce:animate-none">
          <Layer depth="back">
            <defs>
              <radialGradient id={LOBE_GRADIENT} cx="35%" cy="30%" r="80%">
                <stop offset="0" style={light} stopOpacity={0.85} />
                <stop offset="0.45" style={primary} stopOpacity={0.4} />
                <stop offset="1" style={primary} stopOpacity={0.8} />
              </radialGradient>
            </defs>
            {/* Vena cava superior, arco aórtico con sus tres ramas y aurícula izquierda. */}
            <Tube d="M 64 110 L 62 34" width={16} />
            <Tube d="M 106 100 C 102 72, 104 48, 118 38 C 132 28, 152 32, 156 50 C 159 62, 156 74, 152 84" width={20} />
            <Tube d="M 118 38 L 114 10" width={9} />
            <Tube d="M 134 31 L 134 6" width={9} />
            <Tube d="M 149 37 L 154 12" width={9} />
            <path
              d="M 148 94 C 160 86, 176 94, 176 108 C 176 122, 164 128, 154 122 Z"
              fill={`url(#${LOBE_GRADIENT})`}
              stroke="var(--primary)"
              strokeOpacity={0.7}
              strokeWidth={1.25}
            />
          </Layer>

          <Layer depth="middle">
            <defs>
              <radialGradient id={BODY_GRADIENT} cx="38%" cy="28%" r="85%">
                <stop offset="0" style={light} stopOpacity={0.9} />
                <stop offset="0.4" style={primary} stopOpacity={0.45} />
                <stop offset="1" style={primary} stopOpacity={0.9} />
              </radialGradient>
            </defs>
            {/* Aurícula derecha y ventrículos. */}
            <path
              d="M 76 98 C 62 88, 42 94, 40 112 C 38 128, 50 140, 66 140 C 74 132, 78 116, 76 98 Z"
              fill={`url(#${BODY_GRADIENT})`}
              stroke="var(--primary)"
              strokeOpacity={0.75}
              strokeWidth={1.25}
            />
            <path
              d="M 72 96 C 90 84, 118 84, 140 88 C 164 92, 178 112, 174 140 C 170 172, 146 200, 118 222 C 112 227, 106 227, 102 220 C 80 196, 56 168, 52 140 C 50 118, 58 104, 72 96 Z"
              fill={`url(#${BODY_GRADIENT})`}
              stroke="var(--primary)"
              strokeOpacity={0.8}
              strokeWidth={1.5}
            />
            <path
              d="M 114 90 C 104 128, 104 178, 110 222"
              fill="none"
              stroke="var(--primary)"
              strokeOpacity={0.45}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Layer>

          <Layer depth="front">
            <defs>
              <radialGradient id={GLOSS_GRADIENT} cx="50%" cy="50%" r="50%">
                <stop offset="0" style={light} stopOpacity={0.55} />
                <stop offset="1" style={light} stopOpacity={0} />
              </radialGradient>
            </defs>
            {/* Tronco pulmonar, arterias coronarias y brillo. */}
            <Tube d="M 98 112 C 94 92, 92 78, 86 68 C 80 60, 66 58, 46 62" width={15} />
            <Tube d="M 88 72 C 96 62, 104 60, 112 62" width={9} />
            <g fill="none" stroke="white" strokeOpacity={0.6} strokeWidth={1.6} strokeLinecap="round">
              <path d="M 106 100 C 98 122, 94 152, 98 192" />
              <path d="M 99 132 C 86 140, 74 150, 66 166" />
              <path d="M 98 162 C 110 170, 124 172, 140 166" />
              <path d="M 132 100 C 152 112, 162 134, 160 160" />
              <path d="M 152 122 C 142 140, 134 152, 130 178" />
            </g>
            <ellipse cx={86} cy={128} rx={16} ry={30} transform="rotate(-20 86 128)" fill={`url(#${GLOSS_GRADIENT})`} />
          </Layer>
        </div>
      </div>
    </div>
  );
}
