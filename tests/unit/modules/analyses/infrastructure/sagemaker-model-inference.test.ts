import { InvokeEndpointCommand } from "@aws-sdk/client-sagemaker-runtime";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";
import { createSageMakerModelInference } from "@/modules/analyses/infrastructure/adapters/sagemaker-model-inference";

import { sampleProbabilities } from "../../../../support/analysis-fixtures";
import { syntheticTabular, syntheticWaveform } from "../../../../support/npz-builder";

const SECRET_BODY = "cuerpo interno con Juan Pérez y 987654.321";

function validResponse(overrides: Record<string, unknown> = {}) {
  return {
    Body: {
      transformToString: async () =>
        JSON.stringify({
          model: "echonext-mini",
          model_version: "1.0.0",
          probabilities: sampleProbabilities(),
          ...overrides,
        }),
    },
  };
}

function setup(behavior: () => Promise<unknown>) {
  const send = vi.fn<(command: unknown, options: unknown) => Promise<unknown>>(behavior);
  const model = createSageMakerModelInference({ client: { send } as never, endpointName: "medicia-dev-echonext-mini" });

  return {
    send,
    predict: (signal: AbortSignal = new AbortController().signal) =>
      model.predict({ waveform: syntheticWaveform(), tabular: syntheticTabular(), signal }),
  };
}

function awsError(name: string, status?: number) {
  return Object.assign(new Error(SECRET_BODY), { name, $metadata: { httpStatusCode: status } });
}

describe("modelo real en SageMaker", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it("devuelve el modelo, la versión y las 12 probabilidades de una respuesta válida", async () => {
    const { predict } = setup(async () => validResponse());

    const result = await predict();

    expect(result).toEqual({
      modelName: "echonext-mini",
      modelVersion: "1.0.0",
      probabilities: sampleProbabilities(),
    });
  });

  it("envía el cuerpo del contrato: 2500 filas de 12 y 7 variables, sin redondear, con el tope de tiempo", async () => {
    const { predict, send } = setup(async () => validResponse());
    const controller = new AbortController();

    await predict(controller.signal);

    const [command, options] = send.mock.calls[0] as [InvokeEndpointCommand, { abortSignal: AbortSignal }];
    const body = JSON.parse(command.input.Body as string) as { waveform: number[][]; tabular: number[] };
    const waveform = syntheticWaveform();

    expect(command).toBeInstanceOf(InvokeEndpointCommand);
    expect(command.input).toMatchObject({
      EndpointName: "medicia-dev-echonext-mini",
      ContentType: "application/json",
      Accept: "application/json",
    });
    expect(body.waveform).toHaveLength(2500);
    expect(body.waveform.every((row) => row.length === 12)).toBe(true);
    expect(body.waveform[1]?.[3]).toBe(waveform[12 + 3]);
    expect(body.tabular).toEqual(Array.from(syntheticTabular()));
    expect(options.abortSignal).toBe(controller.signal);
  });

  it.each([
    { label: "ModelError 424", error: awsError("ModelError", 424), code: "INPUT_REJECTED" },
    { label: "400 directo", error: awsError("BadRequest", 400), code: "INPUT_REJECTED" },
    { label: "punto apagado (ValidationError)", error: awsError("ValidationError", 400), code: "MODEL_UNAVAILABLE" },
    { label: "ServiceUnavailable", error: awsError("ServiceUnavailable", 503), code: "MODEL_UNAVAILABLE" },
    {
      label: "red caída (ECONNREFUSED)",
      error: Object.assign(new Error(SECRET_BODY), { code: "ECONNREFUSED" }),
      code: "MODEL_UNAVAILABLE",
    },
    {
      label: "DNS (ENOTFOUND en la causa)",
      error: Object.assign(new Error(SECRET_BODY), { cause: { code: "ENOTFOUND" } }),
      code: "MODEL_UNAVAILABLE",
    },
    { label: "tiempo agotado", error: awsError("AbortError"), code: "TIMEOUT" },
    { label: "AccessDenied", error: awsError("AccessDenied", 403), code: "INTERNAL" },
    { label: "InternalFailure", error: awsError("InternalFailure", 500), code: "INTERNAL" },
    { label: "error desconocido", error: new TypeError(SECRET_BODY), code: "INTERNAL" },
  ])("traduce $label al código $code", async ({ error, code }) => {
    const { predict } = setup(async () => {
      throw error;
    });

    await expect(predict()).rejects.toMatchObject({ name: "ModelInferenceError", code });
  });

  it("el mensaje del error y el registro nunca llevan el cuerpo del error ni valores del estudio", async () => {
    const { predict } = setup(async () => {
      throw awsError("ModelError", 424);
    });

    const failure = (await predict().catch((error: unknown) => error)) as ModelInferenceError;
    const logged = errors.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(failure).toBeInstanceOf(ModelInferenceError);
    expect(failure.message).not.toContain("Juan");
    expect(failure.message).not.toContain("987654");
    expect(logged).toBe("[modelo] falló la inferencia (ModelError) código=INPUT_REJECTED");
  });

  it.each([
    { label: "una clave de más", overrides: { probabilities: { ...sampleProbabilities(), extra: 0.5 } } },
    { label: "una clave de menos", overrides: { probabilities: {} } },
    { label: "un valor mayor que 1", overrides: { probabilities: { ...sampleProbabilities(), shd: 1.5 } } },
    { label: "un valor negativo", overrides: { probabilities: { ...sampleProbabilities(), shd: -0.1 } } },
    { label: "model_version vacía", overrides: { model_version: "" } },
    { label: "sin model", overrides: { model: undefined } },
  ])("una respuesta con $label es una falla interna", async ({ overrides }) => {
    const { predict } = setup(async () => validResponse(overrides));

    await expect(predict()).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("una respuesta vacía o que no es JSON es una falla interna", async () => {
    await expect(setup(async () => ({})).predict()).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(
      setup(async () => ({ Body: { transformToString: async () => "no es json" } })).predict(),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
