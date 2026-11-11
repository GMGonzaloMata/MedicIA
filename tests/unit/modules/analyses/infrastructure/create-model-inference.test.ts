import { describe, expect, it } from "vitest";

import { createModelInference } from "@/modules/analyses/infrastructure/adapters/create-model-inference";

describe("elección del adaptador real", () => {
  it("con MODEL_INFERENCE=sagemaker crea el adaptador real sin conectarse", () => {
    const model = createModelInference({
      MODEL_INFERENCE: "sagemaker",
      SAGEMAKER_ENDPOINT_NAME: "medicia-dev-echonext-mini",
      AWS_REGION: "sa-east-1",
    });

    expect(typeof model.predict).toBe("function");
  });

  it("con sagemaker nombra las variables que faltan", () => {
    expect(() => createModelInference({ MODEL_INFERENCE: "sagemaker" })).toThrow(/SAGEMAKER_ENDPOINT_NAME, AWS_REGION/);
    expect(() => createModelInference({ MODEL_INFERENCE: "sagemaker", AWS_REGION: "sa-east-1" })).toThrow(
      /SAGEMAKER_ENDPOINT_NAME/,
    );
  });

  it("sin MODEL_INFERENCE o con un valor desconocido falla con el mensaje claro", () => {
    expect(() => createModelInference({})).toThrow('MODEL_INFERENCE debe ser "sagemaker" o "fake".');
    expect(() => createModelInference({ MODEL_INFERENCE: "otro" })).toThrow(
      'MODEL_INFERENCE debe ser "sagemaker" o "fake".',
    );
  });
});
