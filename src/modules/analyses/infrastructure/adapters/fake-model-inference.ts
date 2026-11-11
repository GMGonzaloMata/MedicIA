import type { ModelInference } from "../../application/ports/out/model-inference";
import { ModelInferenceError } from "../../domain/analysis-errors";
import { FINDING_KEYS, type Probabilities } from "../../domain/findings";

export const FAKE_MODEL_NAME = "echonext-mini-fake";
export const FAKE_MODEL_VERSION = "0.0.0-fake";
export const DEFAULT_FAKE_DELAY_MS = 1500;

// Valores centinela en el cuarto lugar de `tabular` (frecuencia auricular estandarizada). Caen dentro del rango
// que admite la carga de estudios, así que una prueba arma su propio estudio con uno de ellos y no afecta a las demás.
const SENTINEL_POSITION = 3;
const SENTINEL_TOLERANCE = 0.005;
export const FAKE_SENTINELS = {
  INPUT_REJECTED: 7.77,
  MODEL_UNAVAILABLE: 7.78,
  TIMEOUT: 7.79,
} as const;

function matches(value: number | undefined, sentinel: number): boolean {
  return value !== undefined && Math.abs(value - sentinel) < SENTINEL_TOLERANCE;
}

// Espera `delayMs`; si el `signal` se aborta antes, falla con TIMEOUT. Con `delayMs` en `null` espera solo el aborto.
function wait(delayMs: number | null, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ModelInferenceError("TIMEOUT"));

      return;
    }

    const timer = delayMs === null ? null : setTimeout(onDone, delayMs);

    function onAbort() {
      if (timer) {
        clearTimeout(timer);
      }
      reject(new ModelInferenceError("TIMEOUT"));
    }

    function onDone() {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Resumen numérico de la entrada: cambia si cambia cualquier valor de la onda o de las variables.
function digest(waveform: Float32Array, tabular: Float32Array): number {
  let total = 0;

  for (let index = 0; index < waveform.length; index += 1) {
    total += (waveform[index] ?? 0) * ((index % 97) + 1);
  }

  for (let index = 0; index < tabular.length; index += 1) {
    total += (tabular[index] ?? 0) * (index + 1) * 1000;
  }

  return total;
}

function fraction(value: number): number {
  const scrambled = Math.sin(value) * 43758.5453;

  return scrambled - Math.floor(scrambled);
}

function probabilitiesFor(seed: number): Probabilities {
  const values = FINDING_KEYS.map((key, index) => fraction(seed + (index + 1) * 78.233 + key.length));
  const others = values.slice(0, -1);
  const highest = Math.max(...others);
  // El compuesto («al menos uno de los otros once») nunca es menor que el mayor de ellos.
  const composite = highest + (1 - highest) * fraction(seed + 999);

  return Object.fromEntries(
    FINDING_KEYS.map((key, index) => [key, index === FINDING_KEYS.length - 1 ? composite : (values[index] ?? 0)]),
  ) as Probabilities;
}

// Modelo simulado para desarrollo y pruebas (specs/008-analisis-estudio-ecg/contracts/model-inference.md).
export function createFakeModelInference({
  delayMs = DEFAULT_FAKE_DELAY_MS,
}: { delayMs?: number } = {}): ModelInference {
  return {
    async predict({ waveform, tabular, signal }) {
      const marker = tabular[SENTINEL_POSITION];

      if (matches(marker, FAKE_SENTINELS.TIMEOUT)) {
        await wait(null, signal);
      }

      await wait(delayMs, signal);

      if (matches(marker, FAKE_SENTINELS.INPUT_REJECTED)) {
        throw new ModelInferenceError("INPUT_REJECTED");
      }

      if (matches(marker, FAKE_SENTINELS.MODEL_UNAVAILABLE)) {
        throw new ModelInferenceError("MODEL_UNAVAILABLE");
      }

      return {
        modelName: FAKE_MODEL_NAME,
        modelVersion: FAKE_MODEL_VERSION,
        probabilities: probabilitiesFor(digest(waveform, tabular)),
      };
    },
  };
}
