import { describe, expect, it } from "vitest";

import { createStudyFileStorage } from "@/modules/studies/infrastructure/adapters/create-study-file-storage";

describe("elección del almacenamiento de estudios", () => {
  it("fake elige el almacenamiento en memoria", async () => {
    const storage = createStudyFileStorage({ STUDY_STORAGE: "fake" });

    await expect(storage.list("studies/zzz-ninguno/")).resolves.toEqual([]);
  });

  it("s3 elige el adaptador de S3 con la configuración del entorno", () => {
    const storage = createStudyFileStorage({
      STUDY_STORAGE: "s3",
      STUDIES_BUCKET: "bucket-de-prueba",
      AWS_REGION: "sa-east-1",
    });

    expect(storage).toHaveProperty("put");
  });

  it("s3 sin bucket o región falla nombrando la variable", () => {
    expect(() => createStudyFileStorage({ STUDY_STORAGE: "s3" })).toThrow(/STUDIES_BUCKET/);
  });

  it("un valor ausente o desconocido lanza un error que nombra la variable", () => {
    expect(() => createStudyFileStorage({})).toThrow(/STUDY_STORAGE/);
    expect(() => createStudyFileStorage({ STUDY_STORAGE: "disco" })).toThrow(/STUDY_STORAGE/);
  });
});
