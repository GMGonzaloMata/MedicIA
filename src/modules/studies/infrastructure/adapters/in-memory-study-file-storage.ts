import type { StoredObjectInfo, StudyFileStorage } from "../../application/ports/out/study-file-storage";

interface StoredObject {
  bytes: Uint8Array;
  lastModified: Date;
}

// Almacenamiento simulado para desarrollo sin AWS y para las pruebas de extremo a extremo
// (`STUDY_STORAGE=fake`). Los objetos viven en la memoria del proceso. Se guardan en `globalThis` porque
// Next puede cargar este archivo más de una vez (una por ruta o por recarga): con varias copias, una carga
// y una lista no se verían entre sí.
const globalForStorage = globalThis as unknown as { fakeStudyObjects?: Map<string, StoredObject> };

export interface InMemoryStudyFileStorage extends StudyFileStorage {
  // Ayudas para las pruebas.
  has(key: string): boolean;
  read(key: string): Uint8Array | undefined;
  setLastModified(key: string, lastModified: Date): void;
  failNextPut: boolean;
  failNextDelete: boolean;
}

export function createInMemoryStudyFileStorage(
  objects: Map<string, StoredObject> = (globalForStorage.fakeStudyObjects ??= new Map()),
): InMemoryStudyFileStorage {
  const storage: InMemoryStudyFileStorage = {
    failNextPut: false,
    failNextDelete: false,

    async put(key, bytes) {
      if (storage.failNextPut) {
        storage.failNextPut = false;
        throw new Error("falla simulada del almacenamiento");
      }
      objects.set(key, { bytes: bytes.slice(), lastModified: new Date() });
    },

    async delete(key) {
      if (storage.failNextDelete) {
        storage.failNextDelete = false;
        throw new Error("falla simulada del almacenamiento");
      }
      objects.delete(key);
    },

    async list(prefix): Promise<StoredObjectInfo[]> {
      return [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({ key, lastModified: object.lastModified }));
    },

    has: (key) => objects.has(key),
    read: (key) => objects.get(key)?.bytes,
    setLastModified(key, lastModified) {
      const object = objects.get(key);
      if (object) {
        object.lastModified = lastModified;
      }
    },
  };

  return storage;
}
