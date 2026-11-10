import { describe, expect, it } from "vitest";

import { loadS3Config } from "@/infrastructure/aws/s3/config";

describe("configuración del almacenamiento de estudios", () => {
  it("devuelve el bucket y la región", () => {
    expect(loadS3Config({ STUDIES_BUCKET: "bucket-de-prueba", AWS_REGION: "sa-east-1" })).toEqual({
      bucket: "bucket-de-prueba",
      region: "sa-east-1",
    });
  });

  it("nombra las variables que faltan y nunca su valor", () => {
    expect(() => loadS3Config({ STUDIES_BUCKET: "secreto-del-bucket" })).toThrow(/AWS_REGION/);
    expect(() => loadS3Config({ STUDIES_BUCKET: "secreto-del-bucket" })).not.toThrow(/secreto-del-bucket/);
    expect(() => loadS3Config({})).toThrow(/STUDIES_BUCKET, AWS_REGION/);
  });

  it("rechaza valores vacíos", () => {
    expect(() => loadS3Config({ STUDIES_BUCKET: "", AWS_REGION: "sa-east-1" })).toThrow(/STUDIES_BUCKET/);
  });
});
