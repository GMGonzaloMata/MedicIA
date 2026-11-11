import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";
import { FINDING_KEYS } from "@/modules/analyses/domain/findings";
import { createModelInference } from "@/modules/analyses/infrastructure/adapters/create-model-inference";
import {
  FAKE_MODEL_NAME,
  FAKE_MODEL_VERSION,
  FAKE_SENTINELS,
  createFakeModelInference,
} from "@/modules/analyses/infrastructure/adapters/fake-model-inference";

import { syntheticTabular, syntheticWaveform } from "../../../../support/npz-builder";

function input(overrides: { tabular?: Float32Array; waveform?: Float32Array } = {}) {
  return {
    waveform: overrides.waveform ?? syntheticWaveform(),
    tabular: overrides.tabular ?? syntheticTabular(),
    signal: new AbortController().signal,
  };
}

function withSentinel(value: number): Float32Array {
  const tabular = syntheticTabular();
  tabular[3] = value;

  return tabular;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("modelo simulado", () => {
  const model = createFakeModelInference({ delayMs: 0 });

  it("es determinista y devuelve las 12 claves en orden entre 0 y 1", async () => {
    const first = await model.predict(input());
    const second = await model.predict(input());

    expect(second).toEqual(first);
    expect(first.modelName).toBe(FAKE_MODEL_NAME);
    expect(first.modelVersion).toBe(FAKE_MODEL_VERSION);
    expect(Object.keys(first.probabilities)).toEqual([...FINDING_KEYS]);
    for (const value of Object.values(first.probabilities)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("el compuesto no es menor que ninguno de los otros once", async () => {
    const { probabilities } = await model.predict(input());
    const others = FINDING_KEYS.slice(0, -1).map((key) => probabilities[key]);

    expect(probabilities.shd).toBeGreaterThanOrEqual(Math.max(...others));
  });

  it("entradas distintas dan resultados distintos", async () => {
    const changedTabular = syntheticTabular();
    changedTabular[1] = 0.9;
    const changedWaveform = syntheticWaveform();
    changedWaveform[100] = 1.5;

    const base = await model.predict(input());

    expect((await model.predict(input({ tabular: changedTabular }))).probabilities).not.toEqual(base.probabilities);
    expect((await model.predict(input({ waveform: changedWaveform }))).probabilities).not.toEqual(base.probabilities);
  });

  it("los centinelas fuerzan entrada rechazada y modelo no disponible", async () => {
    await expect(model.predict(input({ tabular: withSentinel(FAKE_SENTINELS.INPUT_REJECTED) }))).rejects.toMatchObject({
      code: "INPUT_REJECTED",
    });
    await expect(
      model.predict(input({ tabular: withSentinel(FAKE_SENTINELS.MODEL_UNAVAILABLE) })),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  it("el centinela de demora espera hasta que se aborta el tope y falla con TIMEOUT", async () => {
    const controller = new AbortController();
    let settled = false;
    const pending = model
      .predict({
        ...input({ tabular: withSentinel(FAKE_SENTINELS.TIMEOUT) }),
        signal: controller.signal,
      })
      .finally(() => {
        settled = true;
      });
    const assertion = expect(pending).rejects.toBeInstanceOf(ModelInferenceError);

    await Promise.resolve();
    expect(settled).toBe(false);

    controller.abort();
    await assertion;
  });

  it("la espera respeta el aborto y también el que ya venía abortado", async () => {
    const slow = createFakeModelInference({ delayMs: 60_000 });
    const controller = new AbortController();
    const pending = slow.predict({ ...input(), signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      code: "TIMEOUT",
    });

    controller.abort();
    await assertion;
    await expect(slow.predict({ ...input(), signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("espera el tiempo configurado antes de responder", async () => {
    vi.useFakeTimers();
    const delayed = createFakeModelInference({ delayMs: 1500 });
    let done = false;
    const pending = delayed.predict(input()).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });
});

describe("elección del modelo", () => {
  it("crea el simulado con MODEL_INFERENCE=fake y acepta una espera propia", async () => {
    const model = createModelInference({
      MODEL_INFERENCE: "fake",
      FAKE_MODEL_DELAY_MS: "0",
    });

    expect((await model.predict(input())).modelName).toBe(FAKE_MODEL_NAME);
  });

  it("sin valor, o con uno desconocido, falla con un mensaje claro", () => {
    expect(() => createModelInference({})).toThrow('MODEL_INFERENCE debe ser "sagemaker" o "fake".');
    expect(() => createModelInference({ MODEL_INFERENCE: "otro" })).toThrow('MODEL_INFERENCE debe ser "sagemaker"');
  });

  it("rechaza una espera inválida", () => {
    expect(() =>
      createModelInference({
        MODEL_INFERENCE: "fake",
        FAKE_MODEL_DELAY_MS: "abc",
      }),
    ).toThrow("FAKE_MODEL_DELAY_MS");
    expect(() =>
      createModelInference({
        MODEL_INFERENCE: "fake",
        FAKE_MODEL_DELAY_MS: "-1",
      }),
    ).toThrow("FAKE_MODEL_DELAY_MS");
  });
});
