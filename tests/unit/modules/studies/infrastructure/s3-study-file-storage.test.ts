import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { createS3StudyFileStorage } from "@/modules/studies/infrastructure/adapters/s3-study-file-storage";

function setup(responses: unknown[] = []) {
  const send = vi.fn<(command: unknown) => Promise<unknown>>(async () => responses.shift() ?? {});

  return { send, storage: createS3StudyFileStorage({ client: { send } as never, bucket: "bucket-de-prueba" }) };
}

describe("almacenamiento de estudios en S3", () => {
  it("guarda con cifrado SSE-S3 en el bucket y la clave indicados", async () => {
    const { send, storage } = setup();

    await storage.put("studies/a/uno.ecg1", Uint8Array.from([1, 2]));

    const command = send.mock.calls[0]?.[0] as unknown as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "bucket-de-prueba",
      Key: "studies/a/uno.ecg1",
      ServerSideEncryption: "AES256",
    });
  });

  it("borra un objeto", async () => {
    const { send, storage } = setup();

    await storage.delete("studies/a/uno.ecg1");

    const command = send.mock.calls[0]?.[0] as unknown as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: "bucket-de-prueba", Key: "studies/a/uno.ecg1" });
  });

  it("lista por prefijo siguiendo las páginas y devuelve la antigüedad", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-02-01T00:00:00Z");
    const { send, storage } = setup([
      { Contents: [{ Key: "studies/a/1.ecg1", LastModified: older }], IsTruncated: true, NextContinuationToken: "t" },
      { Contents: [{ Key: "studies/a/2.ecg1", LastModified: newer }, { Key: "sin-fecha" }], IsTruncated: false },
    ]);

    const objects = await storage.list("studies/");

    expect(objects).toEqual([
      { key: "studies/a/1.ecg1", lastModified: older },
      { key: "studies/a/2.ecg1", lastModified: newer },
    ]);
    const second = send.mock.calls[1]?.[0] as unknown as ListObjectsV2Command;
    expect(second.input).toMatchObject({ Prefix: "studies/", ContinuationToken: "t" });
  });

  it("una lista vacía devuelve un arreglo vacío", async () => {
    expect(await setup([{}]).storage.list("studies/")).toEqual([]);
  });

  it("no agrega datos del estudio a los errores", async () => {
    const send = vi.fn(async () => {
      throw new Error("AccessDenied");
    });
    const storage = createS3StudyFileStorage({ client: { send } as never, bucket: "b" });

    await expect(storage.put("studies/a/uno.ecg1", Uint8Array.from([7, 7, 7]))).rejects.toThrow(/^AccessDenied$/);
  });
});
