import { describe, expect, it } from "vitest";

import { createReconcileStudyFiles } from "@/modules/studies/application/use-cases/reconcile-study-files";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";

const NOW = new Date("2026-11-10T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000);

async function setup() {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());

  const put = async (key: string, age: number) => {
    await storage.put(key, Uint8Array.from([1]));
    storage.setLastModified(key, minutesAgo(age));
  };
  await put("studies/t/con-fila.ecg1", 500);
  await studies.insertWithNextNumber({
    id: "con-fila",
    tenantId: "t",
    patientId: "p",
    uploadedByUserId: "u",
    type: "ECG",
    storageKey: "studies/t/con-fila.ecg1",
  });
  await put("studies/t/huerfano-viejo.ecg1", 500);
  await put("studies/t/huerfano-nuevo.ecg1", 5);

  return { storage, reconcile: createReconcileStudyFiles({ studies, storage, now: () => NOW }) };
}

describe("conciliar archivos de estudios", () => {
  it("por defecto informa los huérfanos viejos y no borra nada", async () => {
    const { storage, reconcile } = await setup();

    const result = await reconcile({ apply: false, minAgeMinutes: 60 });

    expect(result).toEqual({ scanned: 3, orphans: ["studies/t/huerfano-viejo.ecg1"], deleted: 0 });
    expect(await storage.list("studies/")).toHaveLength(3);
  });

  it("descarta los más nuevos que el mínimo y los que tienen fila", async () => {
    const { reconcile } = await setup();

    const strict = await reconcile({ apply: false, minAgeMinutes: 1000 });
    const loose = await reconcile({ apply: false, minAgeMinutes: 0 });

    expect(strict.orphans).toEqual([]);
    expect(loose.orphans.sort()).toEqual(["studies/t/huerfano-nuevo.ecg1", "studies/t/huerfano-viejo.ecg1"]);
    expect(loose.orphans).not.toContain("studies/t/con-fila.ecg1");
  });

  it("con apply borra solo los huérfanos y nunca un objeto con fila", async () => {
    const { storage, reconcile } = await setup();

    const result = await reconcile({ apply: true, minAgeMinutes: 60 });

    expect(result.deleted).toBe(1);
    expect(storage.has("studies/t/huerfano-viejo.ecg1")).toBe(false);
    expect(storage.has("studies/t/con-fila.ecg1")).toBe(true);
    expect(storage.has("studies/t/huerfano-nuevo.ecg1")).toBe(true);
  });

  it("consulta las claves en tandas", async () => {
    const studies = new InMemoryStudyRepository();
    const storage = createInMemoryStudyFileStorage(new Map());
    for (let index = 0; index < 1200; index += 1) {
      await storage.put(`studies/t/${index}.ecg1`, Uint8Array.from([1]));
      storage.setLastModified(`studies/t/${index}.ecg1`, minutesAgo(500));
    }

    const result = await createReconcileStudyFiles({ studies, storage, now: () => NOW })({
      apply: false,
      minAgeMinutes: 60,
    });

    expect(result.orphans).toHaveLength(1200);
  });
});
