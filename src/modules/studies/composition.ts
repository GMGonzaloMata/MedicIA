import "server-only";

import { randomUUID } from "node:crypto";

import { createListStudies } from "./application/use-cases/list-studies";
import { createUploadStudy } from "./application/use-cases/upload-study";
import { createStudyFileStorage } from "./infrastructure/adapters/create-study-file-storage";
import { createNpzStudyFileReader } from "./infrastructure/adapters/npz-reader";
import { prismaPatientDirectory } from "./infrastructure/repositories/prisma-patient-directory";
import { prismaStudyRepository } from "./infrastructure/repositories/prisma-study-repository";

function buildStudiesModule() {
  const storage = createStudyFileStorage(process.env);

  return {
    uploadStudy: createUploadStudy({
      studies: prismaStudyRepository,
      storage,
      reader: createNpzStudyFileReader(),
      directory: prismaPatientDirectory,
      generateId: randomUUID,
    }),
    listStudies: createListStudies({ studies: prismaStudyRepository, directory: prismaPatientDirectory }),
  };
}

type StudiesModule = ReturnType<typeof buildStudiesModule>;

// El módulo se arma la primera vez que se usa, no al importar el archivo, para que `next build` no falle si
// faltan variables de entorno. Se guarda en `globalThis` porque Next puede cargar este archivo más de una vez.
// El `as unknown as` solo declara esa propiedad extra; el valor guardado siempre es un StudiesModule.
const globalForStudies = globalThis as unknown as { studiesModule?: StudiesModule };

export function getStudiesModule(): StudiesModule {
  globalForStudies.studiesModule ??= buildStudiesModule();

  return globalForStudies.studiesModule;
}
