import { createGetAnalysis } from "@/modules/analyses/application/use-cases/get-analysis";
import { createHasAnalysisInProgress } from "@/modules/analyses/application/use-cases/has-analysis-in-progress";
import { createListAnalyses } from "@/modules/analyses/application/use-cases/list-analyses";
import { createRequestAnalysis } from "@/modules/analyses/application/use-cases/request-analysis";
import type { AnalysisActor } from "@/modules/analyses/domain/analysis";
import { createFakeModelInference } from "@/modules/analyses/infrastructure/adapters/fake-model-inference";
import { createStudySource } from "@/modules/analyses/infrastructure/adapters/study-source";
import { prismaAnalysisRepository } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";
import { createAuthorizeStudy } from "@/modules/studies/application/use-cases/authorize-study";
import { createDeleteStudy } from "@/modules/studies/application/use-cases/delete-study";
import { createReadStudyModelInput } from "@/modules/studies/application/use-cases/read-study-model-input";
import { createUploadStudy } from "@/modules/studies/application/use-cases/upload-study";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { createNpzStudyFileReader } from "@/modules/studies/infrastructure/adapters/npz-reader";
import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";
import { prismaStudyRepository } from "@/modules/studies/infrastructure/repositories/prisma-study-repository";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createTenant,
  createUser,
  prismaClient,
} from "./database";
import { buildNpz } from "./npz-builder";

// Mundo de las pruebas de integración de análisis: dos clínicas, dos pacientes, dos médicos en la clínica A (uno
// asignado al paciente 1) y uno en la B, con un estudio del paciente 1. Usa los repositorios reales de Prisma, el
// almacenamiento en memoria y el modelo simulado sin espera.
export async function createAnalysisWorld() {
  const storage = createInMemoryStudyFileStorage(new Map());
  let counter = 0;
  const uploadStudy = createUploadStudy({
    studies: prismaStudyRepository,
    storage,
    reader: createNpzStudyFileReader(),
    directory: prismaPatientDirectory,
    generateId: () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, "0")}`,
  });
  const authorizeStudy = createAuthorizeStudy({ studies: prismaStudyRepository, directory: prismaPatientDirectory });
  const readStudyModelInput = createReadStudyModelInput({ studies: prismaStudyRepository, storage, authorizeStudy });
  const studySource = createStudySource({ authorizeStudy, readStudyModelInput });
  const modelInference = createFakeModelInference({ delayMs: 0 });
  const now = () => new Date();
  const hasAnalysisInProgress = createHasAnalysisInProgress({ analyses: prismaAnalysisRepository, now });

  const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
  const [adminUser, doctor1User, doctor2User, p1User, p2User, doctorBUser] = await Promise.all(
    Array.from({ length: 6 }, () => createUser()),
  );
  const doctor1 = await createDoctorMembership({ tenantId: tenantA.id, userId: doctor1User!.id });
  const doctor2 = await createDoctorMembership({ tenantId: tenantA.id, userId: doctor2User!.id });
  const doctorB = await createDoctorMembership({ tenantId: tenantB.id, userId: doctorBUser!.id });
  const p1 = await createLinkedPatient({ tenantId: tenantA.id, userId: p1User!.id });
  const p2 = await createLinkedPatient({ tenantId: tenantA.id, userId: p2User!.id });

  await createAssignment({
    tenantId: tenantA.id,
    membershipId: doctor1.id,
    patientId: p1.id,
    createdByUserId: adminUser!.id,
  });

  const actors = {
    p1: { kind: "PATIENT", tenantId: tenantA.id, userId: p1User!.id, patientId: p1.id } satisfies AnalysisActor,
    p2: { kind: "PATIENT", tenantId: tenantA.id, userId: p2User!.id, patientId: p2.id } satisfies AnalysisActor,
    doctor1: {
      kind: "DOCTOR",
      tenantId: tenantA.id,
      userId: doctor1User!.id,
      membershipId: doctor1.id,
    } satisfies AnalysisActor,
    doctor2: {
      kind: "DOCTOR",
      tenantId: tenantA.id,
      userId: doctor2User!.id,
      membershipId: doctor2.id,
    } satisfies AnalysisActor,
    doctorB: {
      kind: "DOCTOR",
      tenantId: tenantB.id,
      userId: doctorBUser!.id,
      membershipId: doctorB.id,
    } satisfies AnalysisActor,
  };

  await uploadStudy({ actor: actors.p1, patientId: p1.id, type: "ECG", bytes: new Uint8Array(buildNpz()) });
  const study = await prismaClient.study.findFirstOrThrow();

  return {
    actors,
    study,
    tenantA,
    tenantB,
    doctor1,
    p1,
    adminUser: adminUser!,
    storage,
    uploadStudy,
    studySource,
    requestAnalysis: createRequestAnalysis({
      analyses: prismaAnalysisRepository,
      studySource,
      modelInference,
      now,
    }),
    listAnalyses: createListAnalyses({ analyses: prismaAnalysisRepository, studySource, now }),
    getAnalysis: createGetAnalysis({ analyses: prismaAnalysisRepository, studySource }),
    hasAnalysisInProgress,
    // `deleteStudy` con el `canDeleteStudy` real, igual que lo arma `studies/composition.ts`.
    deleteStudy: createDeleteStudy({
      studies: prismaStudyRepository,
      storage,
      directory: prismaPatientDirectory,
      canDeleteStudy: async ({ tenantId, studyId }) => !(await hasAnalysisInProgress({ tenantId, studyId })),
    }),
  };
}
