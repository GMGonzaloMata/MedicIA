import { describe, expect, it } from "vitest";

import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

function newStorage() {
  return createInMemoryStudyFileStorage(new Map());
}

describe("almacenamiento simulado de estudios", () => {
  it("guarda una copia de los bytes, los lista por prefijo y los borra", async () => {
    const storage = newStorage();
    const bytes = Uint8Array.from([1, 2, 3]);

    await storage.put("studies/clinica-a/uno.ecg1", bytes);
    await storage.put("studies/clinica-b/dos.ecg1", Uint8Array.from([9]));
    bytes[0] = 99;

    expect(storage.read("studies/clinica-a/uno.ecg1")).toEqual(Uint8Array.from([1, 2, 3]));
    expect((await storage.list("studies/clinica-a/")).map((object) => object.key)).toEqual(["studies/clinica-a/uno.ecg1"]);
    expect(await storage.list("studies/")).toHaveLength(2);

    await storage.delete("studies/clinica-a/uno.ecg1");

    expect(storage.has("studies/clinica-a/uno.ecg1")).toBe(false);
    expect(storage.has("studies/clinica-b/dos.ecg1")).toBe(true);
  });

  it("devuelve una copia de los bytes guardados, o null si el objeto no existe", async () => {
    const storage = newStorage();
    await storage.put("studies/clinica-a/uno.ecg1", Uint8Array.from([1, 2, 3]));

    const bytes = await storage.get("studies/clinica-a/uno.ecg1");
    bytes![0] = 99;

    expect(await storage.get("studies/clinica-a/uno.ecg1")).toEqual(Uint8Array.from([1, 2, 3]));
    expect(await storage.get("studies/no-existe.ecg1")).toBeNull();
  });

  it("borrar un objeto que no existe no es un error", async () => {
    await expect(newStorage().delete("studies/no-existe.ecg1")).resolves.toBeUndefined();
  });

  it("registra la fecha de modificación y permite cambiarla", async () => {
    const storage = newStorage();
    await storage.put("studies/a/x.ecg1", Uint8Array.from([1]));
    const old = new Date("2026-01-01T00:00:00Z");

    storage.setLastModified("studies/a/x.ecg1", old);
    storage.setLastModified("studies/a/no-existe.ecg1", old);

    expect((await storage.list("studies/"))[0]?.lastModified).toEqual(old);
  });

  it("puede simular una falla de guardado o de borrado una sola vez", async () => {
    const storage = newStorage();

    storage.failNextPut = true;
    await expect(storage.put("studies/a/x.ecg1", Uint8Array.from([1]))).rejects.toThrow();
    await expect(storage.put("studies/a/x.ecg1", Uint8Array.from([1]))).resolves.toBeUndefined();

    storage.failNextDelete = true;
    await expect(storage.delete("studies/a/x.ecg1")).rejects.toThrow();
    await expect(storage.delete("studies/a/x.ecg1")).resolves.toBeUndefined();
  });

  it("dos instancias creadas sin mapa propio comparten el estado del proceso", async () => {
    const first = createInMemoryStudyFileStorage();
    const second = createInMemoryStudyFileStorage();

    await first.put("studies/compartido/x.ecg1", Uint8Array.from([5]));

    expect(second.has("studies/compartido/x.ecg1")).toBe(true);
    await first.delete("studies/compartido/x.ecg1");
  });
});
