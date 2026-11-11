import "server-only";

import { randomUUID } from "node:crypto";

import { getAnalysesModule } from "@/modules/analyses/composition";

import { createAuthorizeStudy } from "./application/use-cases/authorize-study";
import { createDeleteStudy } from "./application/use-cases/delete-study";
import { createGetAssignedPatient } from "./application/use-cases/get-assigned-patient";
import { createGetStudyWaveform } from "./application/use-cases/get-study-waveform";
import { createListDoctorPatients } from "./application/use-cases/list-doctor-patients";
import { createListStudies } from "./application/use-cases/list-studies";
import { createReadStudyModelInput } from "./application/use-cases/read-study-model-input";
import { createUploadStudy } from "./application/use-cases/upload-study";
import { createStudyFileStorage } from "./infrastructure/adapters/create-study-file-storage";
import { createNpzStudyFileReader } from "./infrastructure/adapters/npz-reader";
import { prismaPatientDirectory } from "./infrastructure/repositories/prisma-patient-directory";
import { prismaStudyRepository } from "./infrastructure/repositories/prisma-study-repository";

function buildStudiesModule() {
  const storage = createStudyFileStorage(process.env);
  const authorizeStudy = createAuthorizeStudy({ studies: prismaStudyRepository, directory: prismaPatientDirectory });

  return {
    uploadStudy: createUploadStudy({
      studies: prismaStudyRepository,
      storage,
      reader: createNpzStudyFileReader(),
      directory: prismaPatientDirectory,
      generateId: randomUUID,
    }),
    listStudies: createListStudies({ studies: prismaStudyRepository, directory: prismaPatientDirectory }),
    getStudyWaveform: createGetStudyWaveform({
      studies: prismaStudyRepository,
      storage,
      directory: prismaPatientDirectory,
    }),
    authorizeStudy,
    readStudyModelInput: createReadStudyModelInput({ studies: prismaStudyRepository, storage, authorizeStudy }),
    deleteStudy: createDeleteStudy({
      studies: prismaStudyRepository,
      storage,
      directory: prismaPatientDirectory,
      // Con un análisis en curso el estudio no se elimina. Cierre perezoso: `analyses` se consulta recién al eliminar,
      // nunca al armar este módulo.
      canDeleteStudy: async ({ tenantId, studyId }): Promise<boolean> =>
        !(await getAnalysesModule().hasAnalysisInProgress({ tenantId, studyId })),
    }),
    getAssignedPatient: createGetAssignedPatient({ directory: prismaPatientDirectory }),
    listDoctorPatients: createListDoctorPatients({ directory: prismaPatientDirectory }),
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
