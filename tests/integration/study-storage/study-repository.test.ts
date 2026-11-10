import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { prismaStudyRepository } from "@/modules/studies/infrastructure/repositories/prisma-study-repository";

import {
  createLinkedPatient,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";

beforeEach(resetDatabase);

async function setup() {
  const tenant = await createTenant();
  const uploader = await createUser();
  const patientUser = await createUser();
  const patient = await createLinkedPatient({ tenantId: tenant.id, userId: patientUser.id });
  const otherPatient = await createLinkedPatient({ tenantId: tenant.id, userId: (await createUser()).id });

  return { tenant, uploader, patientUser, patient, otherPatient };
}

function newStudy(tenantId: string, patientId: string, uploadedByUserId: string) {
  const id = randomUUID();

  return {
    id,
    tenantId,
    patientId,
    uploadedByUserId,
    type: "ECG" as const,
    storageKey: `studies/${tenantId}/${id}.ecg1`,
  };
}

describe("repositorio de estudios", () => {
  it("numera los estudios de cada paciente desde 1 y de forma independiente", async () => {
    const { tenant, uploader, patient, otherPatient } = await setup();

    const numbers = [
      (await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id))).number,
      (await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id))).number,
      (await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id))).number,
      (await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, otherPatient.id, uploader.id))).number,
    ];

    expect(numbers).toEqual([1, 2, 3, 1]);
  });

  it("20 cargas concurrentes al mismo paciente reciben números únicos y consecutivos", async () => {
    const { tenant, uploader, patient } = await setup();

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id)),
      ),
    );

    const numbers = results.map((study) => study.number).sort((first, second) => first - second);
    expect(numbers).toEqual(Array.from({ length: 20 }, (value, index) => index + 1));
  });

  it("un rollback no consume número", async () => {
    const { tenant, uploader, patient } = await setup();
    const first = newStudy(tenant.id, patient.id, uploader.id);
    await prismaStudyRepository.insertWithNextNumber(first);

    // La clave de almacenamiento repetida hace fallar la inserción dentro de la transacción.
    await expect(
      prismaStudyRepository.insertWithNextNumber({
        ...newStudy(tenant.id, patient.id, uploader.id),
        storageKey: first.storageKey,
      }),
    ).rejects.toThrow();

    const next = await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));
    expect(next.number).toBe(2);
  });

  it("el número no se reutiliza tras eliminar un estudio", async () => {
    const { tenant, uploader, patient } = await setup();
    const first = await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));

    expect(await prismaStudyRepository.deleteById({ tenantId: tenant.id, studyId: first.id })).toBe(true);
    expect(await prismaStudyRepository.deleteById({ tenantId: tenant.id, studyId: first.id })).toBe(false);

    const next = await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));
    expect(next.number).toBe(2);
  });

  it("busca y borra solo dentro de la clínica indicada", async () => {
    const { tenant, uploader, patient } = await setup();
    const other = await createTenant();
    const study = await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));

    expect(await prismaStudyRepository.findById({ tenantId: tenant.id, studyId: study.id })).toMatchObject({
      id: study.id,
    });
    expect(await prismaStudyRepository.findById({ tenantId: other.id, studyId: study.id })).toBeNull();
    expect(await prismaStudyRepository.deleteById({ tenantId: other.id, studyId: study.id })).toBe(false);
  });

  it("lista del más reciente al más antiguo, con quién lo cargó, y pagina", async () => {
    const { tenant, uploader, patientUser, patient } = await setup();
    await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));
    await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, patientUser.id));
    await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));
    const query = { tenantId: tenant.id, patientId: patient.id, pageSize: 2 };

    const first = await prismaStudyRepository.listByPatient({ ...query, page: 1 });
    const second = await prismaStudyRepository.listByPatient({ ...query, page: 2 });

    expect(first.totalItems).toBe(3);
    expect(first.items.map((item) => item.number)).toEqual([3, 2]);
    expect(first.items[1]).toMatchObject({ uploadedByPatient: true, uploadedByUserId: patientUser.id });
    expect(first.items[0]).toMatchObject({ uploadedByPatient: false, uploaderName: uploader.fullName });
    expect(second.items.map((item) => item.number)).toEqual([1]);
  });

  it("no lista los estudios de otra clínica", async () => {
    const { tenant, uploader, patient } = await setup();
    const other = await createTenant();
    await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));

    const result = await prismaStudyRepository.listByPatient({
      tenantId: other.id,
      patientId: patient.id,
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual({ items: [], totalItems: 0 });
  });

  it("de las claves recibidas devuelve las que tienen un estudio", async () => {
    const { tenant, uploader, patient } = await setup();
    const study = await prismaStudyRepository.insertWithNextNumber(newStudy(tenant.id, patient.id, uploader.id));

    expect(
      await prismaStudyRepository.findExistingStorageKeys([study.storageKey, "studies/x/huerfano.ecg1"]),
    ).toEqual(new Set([study.storageKey]));
    expect(await prismaStudyRepository.findExistingStorageKeys([])).toEqual(new Set());
  });

  it("la clave foránea compuesta impide un estudio cuyo paciente es de otra clínica", async () => {
    const { uploader, patient } = await setup();
    const other = await createTenant();

    await expect(
      prismaStudyRepository.insertWithNextNumber(newStudy(other.id, patient.id, uploader.id)),
    ).rejects.toThrow();
  });

  it("hace cumplir number > 0 y last_number > 0", async () => {
    const { tenant, uploader, patient } = await setup();

    await expect(
      prismaClient.study.create({ data: { ...newStudy(tenant.id, patient.id, uploader.id), number: 0 } }),
    ).rejects.toThrow();
    await expect(
      prismaClient.studyCounter.create({ data: { patientId: patient.id, tenantId: tenant.id, lastNumber: 0 } }),
    ).rejects.toThrow();
  });

  it("resuelve una página de un paciente con 500 estudios en menos de 200 ms", async () => {
    const { tenant, uploader, patient } = await setup();
    await prismaClient.study.createMany({
      data: Array.from({ length: 500 }, (value, index) => ({
        ...newStudy(tenant.id, patient.id, uploader.id),
        number: index + 1,
      })),
    });
    const durations: number[] = [];

    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      await prismaStudyRepository.listByPatient({
        tenantId: tenant.id,
        patientId: patient.id,
        page: 12,
        pageSize: 20,
      });
      durations.push(performance.now() - start);
    }

    durations.sort((first, second) => first - second);
    expect(durations[2]).toBeLessThan(200);
  });
});
