import { ECG_DURATION_SECONDS, ECG_LEAD_NAMES, ECG_SAMPLING_HZ } from "@/modules/studies/domain/ecg-leads";

import { STUDY_MESSAGES } from "../../_lib/study-messages";

// Resumen textual de la onda: es la alternativa para quien no puede ver la gráfica y también ayuda a quien sí la ve.
export function WaveformSummary() {
  return (
    <section aria-labelledby="waveform-summary-title" className="flex flex-col gap-3">
      <h2 id="waveform-summary-title" className="text-lg font-semibold">
        Resumen de la señal
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-base sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Derivaciones</dt>
        <dd>{ECG_LEAD_NAMES.join(", ")} ({ECG_LEAD_NAMES.length} en total)</dd>
        <dt className="font-medium">Duración</dt>
        <dd>{ECG_DURATION_SECONDS} segundos</dd>
        <dt className="font-medium">Frecuencia de muestreo</dt>
        <dd>{ECG_SAMPLING_HZ} Hz</dd>
      </dl>
      <p className="text-sm text-muted">{STUDY_MESSAGES.waveformNote}</p>
    </section>
  );
}
