import { describe, expect, it } from "vitest";

import { loadSageMakerConfig } from "@/infrastructure/aws/sagemaker/config";
import { createSageMakerRuntimeClient } from "@/infrastructure/aws/sagemaker/sagemaker-runtime-client";

describe("configuración del punto de inferencia", () => {
  it("devuelve el nombre del punto de inferencia y la región", () => {
    expect(
      loadSageMakerConfig({ SAGEMAKER_ENDPOINT_NAME: "medicia-dev-echonext-mini", AWS_REGION: "sa-east-1" }),
    ).toEqual({ endpointName: "medicia-dev-echonext-mini", region: "sa-east-1" });
  });

  it("nombra las variables que faltan y nunca su valor", () => {
    expect(() => loadSageMakerConfig({ SAGEMAKER_ENDPOINT_NAME: "nombre-secreto" })).toThrow(/AWS_REGION/);
    expect(() => loadSageMakerConfig({ SAGEMAKER_ENDPOINT_NAME: "nombre-secreto" })).not.toThrow(/nombre-secreto/);
    expect(() => loadSageMakerConfig({})).toThrow(/SAGEMAKER_ENDPOINT_NAME, AWS_REGION/);
  });

  it("rechaza valores vacíos", () => {
    expect(() => loadSageMakerConfig({ SAGEMAKER_ENDPOINT_NAME: "", AWS_REGION: "sa-east-1" })).toThrow(
      /SAGEMAKER_ENDPOINT_NAME/,
    );
  });

  it("el cliente se crea con un solo intento", async () => {
    const client = createSageMakerRuntimeClient({ region: "sa-east-1" });

    expect(await client.config.maxAttempts()).toBe(1);
    expect(await client.config.region()).toBe("sa-east-1");
  });
});
