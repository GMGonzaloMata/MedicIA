import { ECG_DURATION_SECONDS, ECG_LEAD_NAMES, ECG_SAMPLING_HZ } from "@/modules/studies/domain/ecg-leads";

import { STUDY_MESSAGES } from "../../_lib/study-messages";

const itemClassName = "flex flex-col gap-0.5 rounded-card bg-elevated px-3 py-2";
const termClassName = "font-label text-xs font-semibold uppercase tracking-wider text-muted";

// Resumen textual de la onda: es la alternativa para quien no puede ver la gráfica y también ayuda a quien sí la ve.
export function WaveformSummary() {
  return (
    <section aria-labelledby="waveform-summary-title" className="flex flex-col gap-3">
      <h3 id="waveform-summary-title" className="font-semibold">
        Resumen de la señal
      </h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className={itemClassName}>
          <dt className={termClassName}>Derivaciones</dt>
          <dd>{ECG_LEAD_NAMES.join(", ")} ({ECG_LEAD_NAMES.length} en total)</dd>
        </div>
        <div className={itemClassName}>
          <dt className={termClassName}>Duración</dt>
          <dd>{ECG_DURATION_SECONDS} segundos</dd>
        </div>
        <div className={itemClassName}>
          <dt className={termClassName}>Frecuencia de muestreo</dt>
          <dd>{ECG_SAMPLING_HZ} Hz</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">{STUDY_MESSAGES.waveformNote}</p>
    </section>
  );
}
