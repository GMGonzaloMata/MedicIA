import type { ReactNode } from "react";

// Ilustración decorativa del corazón para el resultado, en vista anterior: la aurícula derecha abraza el costado
// izquierdo del dibujo, los grandes vasos salen agrupados por arriba (vena cava, arco aórtico con sus ramas y tronco
// pulmonar por delante) y el ápex queda abajo a la derecha. Son tres capas SVG a distinta profundidad que giran
// apenas y laten, así se ve con volumen. No depende del valor: la forma, el color y el movimiento son siempre los
// mismos. Con «reducir movimiento» queda quieta.

const BODY_GRADIENT = "heart-body-gradient";
const GLOSS_GRADIENT = "heart-gloss-gradient";
const TRUNK_FADE = "heart-trunk-fade";
const TRUNK_MASK = "heart-trunk-mask";
const BODY_CLIP = "heart-body-clip";
const SOFT_FILTER = "heart-soft-filter";

const primary = { stopColor: "var(--primary)" };
const light = { stopColor: "white" };

// Un solo trazado para todo el corazón: los ventrículos y, a la izquierda del dibujo, el lóbulo de la aurícula derecha.
const VENTRICLES =
  "M 194 116 C 176 100, 122 100, 86 116 C 78 108, 64 104, 53 112 C 43 120, 37 136, 40 152 C 42 166, 45 178, 49 190 C 54 220, 84 254, 120 276 C 130 282, 142 285, 150 280 C 172 266, 194 234, 204 196 C 212 166, 210 136, 194 116 Z";
const LEFT_VENTRICLE = "M 136 96 C 134 160, 138 200, 141 290 L 230 290 L 230 96 Z";
const LEFT_AURICLE =
  "M 146 126 C 154 114, 176 112, 188 122 C 196 130, 194 146, 184 152 C 174 156, 164 148, 156 150 C 148 150, 142 138, 146 126 Z";

// Vaso con volumen: una base opaca que tapa lo que queda detrás, el borde en el color principal y dos luces.
function Tube({ d, width, cap = "butt" }: { d: string; width: number; cap?: "butt" | "round" }) {
  return (
    <g fill="none" strokeLinecap={cap}>
      <path d={d} stroke="var(--card)" strokeWidth={width} />
      <path d={d} stroke="var(--primary)" strokeOpacity={0.8} strokeWidth={width} />
      <path d={d} stroke="white" strokeOpacity={0.3} strokeWidth={width * 0.7} />
      <path
        d={d}
        stroke="white"
        strokeOpacity={0.4}
        strokeWidth={width * 0.26}
        transform={`translate(${-width * 0.14} ${-width * 0.05})`}
      />
    </g>
  );
}

// Boca abierta de un vaso cortado.
function Lumen({ cx, cy, r, angle = 0 }: { cx: number; cy: number; r: number; angle?: number }) {
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`}>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.36} fill="var(--card)" />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.36} fill="var(--primary)" fillOpacity={0.55} />
      <ellipse cx={cx} cy={cy} rx={r * 0.7} ry={r * 0.2} fill="var(--primary)" fillOpacity={0.9} />
    </g>
  );
}

// Cavidad: base opaca y, encima, el degradado con el contorno.
function Chamber({ d, gradient }: { d: string; gradient: string }) {
  return (
    <>
      <path d={d} fill="var(--card)" />
      <path d={d} fill={`url(#${gradient})`} stroke="var(--primary)" strokeOpacity={0.85} strokeWidth={1.4} />
    </>
  );
}

// Arteria coronaria en relieve: borde en el color principal y luz encima.
function Coronary({ d, width }: { d: string; width: number }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke="var(--primary)" strokeOpacity={0.55} strokeWidth={width + 1.6} />
      <path d={d} stroke="white" strokeOpacity={0.8} strokeWidth={width} />
    </g>
  );
}

type Depth = "back" | "middle" | "front";

function Layer({ depth, children }: { depth: Depth; children: ReactNode }) {
  // La perspectiva agranda lo que está adelante: la escala lo compensa para que las capas coincidan en reposo.
  const transform = {
    back: "[transform:translateZ(-28px)_scale(1.035)]",
    middle: "",
    front: "[transform:translateZ(28px)_scale(0.965)]",
  }[depth];

  return (
    <svg viewBox="0 0 240 290" className={`absolute inset-0 size-full overflow-visible ${transform}`}>
      {children}
    </svg>
  );
}

export function AnalysisHeart() {
  return (
    <div aria-hidden="true" className="relative h-58 w-48 shrink-0 [perspective:800px] @min-[33rem]:h-68 @min-[33rem]:w-56">
      <div className="absolute inset-8 animate-heart-glow rounded-full bg-primary/30 blur-2xl motion-reduce:animate-none" />
      <div className="absolute inset-x-12 -bottom-1 h-3 rounded-full bg-primary/25 blur-md" />
      <div className="relative size-full animate-heart-sway [transform-style:preserve-3d] motion-reduce:animate-none">
        <div className="relative size-full origin-[55%_62%] animate-heart-beat [transform-style:preserve-3d] motion-reduce:animate-none">
          <Layer depth="back">
            {/* Venas pulmonares izquierdas, que asoman por detrás a la derecha. */}
            <Tube d="M 176 107 L 212 102" width={11} />
            <Lumen cx={212} cy={102} r={5.5} angle={82} />
            <Tube d="M 180 121 L 211 121" width={10} />
            <Lumen cx={211} cy={121} r={5} angle={90} />
            {/* Vena cava superior, pegada a la aorta. */}
            <Tube d="M 80 116 L 80 18" width={20} />
            <Lumen cx={80} cy={18} r={10} />
            {/* Ramas del arco aórtico y, por delante de ellas, la aorta. */}
            <Tube d="M 110 72 L 104 12" width={17} />
            <Lumen cx={104} cy={12} r={8.5} angle={-6} />
            <Tube d="M 128 68 L 146 16" width={14} />
            <Lumen cx={146} cy={16} r={7} angle={20} />
            <Tube d="M 148 74 L 165 24" width={13} />
            <Lumen cx={165} cy={24} r={6.5} angle={19} />
            <Tube d="M 104 136 C 100 112, 98 92, 108 78 C 118 64, 142 62, 154 74 C 162 82, 164 94, 162 124" width={30} />
          </Layer>

          <Layer depth="middle">
            <defs>
              <radialGradient id={BODY_GRADIENT} cx="34%" cy="26%" r="92%">
                <stop offset="0" style={light} stopOpacity={0.9} />
                <stop offset="0.32" style={primary} stopOpacity={0.32} />
                <stop offset="0.72" style={primary} stopOpacity={0.68} />
                <stop offset="1" style={primary} stopOpacity={0.95} />
              </radialGradient>
              <clipPath id={BODY_CLIP}>
                <path d={VENTRICLES} />
              </clipPath>
            </defs>
            <Chamber d={VENTRICLES} gradient={BODY_GRADIENT} />
            {/* El ventrículo izquierdo queda apenas más marcado, con las fibras del músculo insinuadas. */}
            <g clipPath={`url(#${BODY_CLIP})`}>
              <path d={LEFT_VENTRICLE} fill="var(--primary)" fillOpacity={0.14} />
              <g fill="none" stroke="var(--primary)" strokeOpacity={0.2} strokeWidth={1} strokeLinecap="round">
                <path d="M 66 150 C 74 196, 100 238, 132 264" />
                <path d="M 86 136 C 92 180, 108 222, 134 250" />
                <path d="M 110 122 C 112 164, 120 204, 136 234" />
                <path d="M 176 124 C 184 166, 178 216, 158 256" />
                <path d="M 194 144 C 198 180, 190 218, 172 246" />
              </g>
              {/* Surco que separa la aurícula y relieve de la orejuela izquierda, dibujados sobre el mismo cuerpo. */}
              <path
                d="M 86 118 C 86 142, 78 168, 50 190"
                fill="none"
                stroke="var(--primary)"
                strokeOpacity={0.35}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
              <path
                d={LEFT_AURICLE}
                fill="var(--primary)"
                fillOpacity={0.1}
                stroke="var(--primary)"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            </g>
          </Layer>


          <Layer depth="front">
            <defs>
              <radialGradient id={GLOSS_GRADIENT} cx="50%" cy="50%" r="50%">
                <stop offset="0" style={light} stopOpacity={0.6} />
                <stop offset="1" style={light} stopOpacity={0} />
              </radialGradient>
              <linearGradient id={TRUNK_FADE} gradientUnits="userSpaceOnUse" x1="0" y1="144" x2="0" y2="120">
                <stop offset="0" style={light} stopOpacity={0} />
                <stop offset="1" style={light} stopOpacity={1} />
              </linearGradient>
              <mask id={TRUNK_MASK} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="290">
                <rect width="240" height="290" fill={`url(#${TRUNK_FADE})`} />
              </mask>
              <filter id={SOFT_FILTER} filterUnits="userSpaceOnUse" x="0" y="0" width="240" height="290">
                <feGaussianBlur stdDeviation="1.6" />
              </filter>
            </defs>
            {/* Tronco pulmonar y arteria pulmonar izquierda: nacen del ventrículo derecho y cruzan por delante. */}
            <Tube d="M 154 100 L 208 85" width={13} />
            <Lumen cx={208} cy={85} r={6.5} angle={74} />
            <g mask={`url(#${TRUNK_MASK})`}>
              <Tube d="M 126 144 C 128 124, 138 108, 156 100" width={28} cap="round" />
            </g>
            {/* Coronarias: descendente anterior con sus ramas, coronaria derecha con la marginal y circunfleja. */}
            <Coronary d="M 136 130 C 134 160, 138 200, 142 232 C 143 250, 142 264, 140 274" width={2.2} />
            <Coronary d="M 136 152 C 150 160, 164 176, 170 196" width={1.4} />
            <Coronary d="M 139 190 C 152 200, 162 214, 164 232" width={1.3} />
            <Coronary d="M 135 162 C 122 168, 110 180, 104 198" width={1.2} />
            <Coronary d="M 140 206 C 128 212, 118 226, 114 240" width={1.1} />
            <Coronary d="M 98 120 C 90 134, 86 152, 80 168 C 76 180, 66 192, 58 202" width={2.2} />
            <Coronary d="M 78 174 C 84 198, 100 226, 120 250" width={1.4} />
            <Coronary d="M 92 132 C 102 142, 108 156, 108 172" width={1.1} />
            <Coronary d="M 188 148 C 197 166, 199 190, 192 212" width={1.4} />
            {/* Brillos. */}
            <ellipse
              cx={96}
              cy={192}
              rx={16}
              ry={38}
              transform="rotate(-28 96 192)"
              fill={`url(#${GLOSS_GRADIENT})`}
            />
            <path
              d="M 54 204 C 64 232, 90 256, 122 274"
              fill="none"
              stroke="white"
              strokeOpacity={0.45}
              strokeWidth={2.5}
              strokeLinecap="round"
              filter={`url(#${SOFT_FILTER})`}
            />
          </Layer>
        </div>
      </div>
    </div>
  );
}
