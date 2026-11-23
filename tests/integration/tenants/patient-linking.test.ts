import { beforeEach, describe, expect, it } from "vitest";

import { createLinkPatientAccount } from "@/modules/tenants/application/use-cases/link-patient-account";
import { createListClinicPatients } from "@/modules/tenants/application/use-cases/list-clinic-patients";
import { createRegeneratePatientLinkCode } from "@/modules/tenants/application/use-cases/regenerate-patient-link-code";
import { createRegisterPatient } from "@/modules/tenants/application/use-cases/register-patient";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { nodeSecretGenerator } from "@/modules/tenants/infrastructure/adapters/node-secret-generator";
import { prismaLinkAttemptRepository } from "@/modules/tenants/infrastructure/repositories/prisma-link-attempt-repository";
import { prismaPatientRegistryRepository } from "@/modules/tenants/infrastructure/repositories/prisma-patient-registry-repository";
import { prismaStaffRepository } from "@/modules/tenants/infrastructure/repositories/prisma-staff-repository";

import {
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const now = () => new Date();
const registerPatient = createRegisterPatient({
  patients: prismaPatientRegistryRepository,
  staff: prismaStaffRepository,
  secrets: nodeSecretGenerator,
  now,
});
const regenerate = createRegeneratePatientLinkCode({
  patients: prismaPatientRegistryRepository,
  secrets: nodeSecretGenerator,
  now,
});
const listClinicPatients = createListClinicPatients({ patients: prismaPatientRegistryRepository, now });
const linkPatientAccount = createLinkPatientAccount({
  patients: prismaPatientRegistryRepository,
  attempts: prismaLinkAttemptRepository,
  secrets: nodeSecretGenerator,
  now,
});

const WRONG_CODE = "ZZZZZ-ZZZZZ";

async function createClinic() {
  const tenant = await createTenant();
  const user = await createUser();
  const admin = await createStaffMembership({ tenantId: tenant.id, userId: user.id });
  const actor: ClinicAdminActor = { tenantId: tenant.id, userId: user.id, membershipId: admin.id };

  return { tenant, actor };
}

async function register(actor: ClinicAdminActor, documentNumber = "12345678") {
  const result = await registerPatient({ actor, documentType: "DNI", documentNumber });

  if (!result.ok) {
    throw new Error(`No se pudo registrar: ${result.code}`);
  }

  return result;
}

async function link(user: { id: string; fullName: string }, code: string, documentNumber = "12345678") {
  return linkPatientAccount({ user, documentType: "DNI", documentNumber, code });
}

describe("la vinculación es una transacción", () => {
  it("asocia la cuenta, pasa a vinculado, usa el código y borra los intentos fallidos", async () => {
    const clinic = await createClinic();
    const { patientId, linkCode } = await register(clinic.actor);
    const user = await createUser({ fullName: "Ana Paciente" });
    await link(user, WRONG_CODE);
    expect(await prismaClient.patientLinkAttempt.count({ where: { userId: user.id } })).toBe(1);

    const result = await link(user, linkCode);

    expect(result).toEqual({ ok: true, tenantId: clinic.tenant.id, patientId });
    expect(await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({
      status: "LINKED",
      userId: user.id,
      fullName: "Ana Paciente",
    });
    expect((await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } })).linkedAt).not.toBeNull();
    expect(await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId } })).toMatchObject({ status: "USED" });
    expect(await prismaClient.patientLinkAttempt.count({ where: { userId: user.id } })).toBe(0);
  });

  it("un registro ya vinculado no se vincula a otra cuenta", async () => {
    const clinic = await createClinic();
    const { patientId, linkCode } = await register(clinic.actor);
    const first = await createUser();
    const second = await createUser();
    await link(first, linkCode);

    expect(await link(second, linkCode)).toEqual({ ok: false, code: "LINK_FAILED" });
    expect((await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } })).userId).toBe(first.id);
  });

  it("dos vinculaciones simultáneas con el mismo código: solo gana una", async () => {
    const clinic = await createClinic();
    const { patientId, linkCode } = await register(clinic.actor);
    const [first, second] = await Promise.all([createUser(), createUser()]);

    const results = await Promise.all([link(first, linkCode), link(second, linkCode)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const patient = await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect([first.id, second.id]).toContain(patient.userId);
  });

  it("una cuenta que ya es paciente de la clínica no se vincula a un segundo registro y el código sigue activo", async () => {
    const clinic = await createClinic();
    const one = await register(clinic.actor, "11111111");
    const two = await register(clinic.actor, "22222222");
    const user = await createUser();
    await link(user, one.linkCode, "11111111");

    expect(await link(user, two.linkCode, "22222222")).toEqual({ ok: false, code: "LINK_FAILED" });
    expect(await prismaClient.patient.findUniqueOrThrow({ where: { id: two.patientId } })).toMatchObject({
      status: "PENDING",
      userId: null,
    });
    expect((await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId: two.patientId } })).status).toBe("ACTIVE");
  });
});

describe("intentos fallidos del código", () => {
  it("al quinto fallo el código queda bloqueado y la base no admite pasar de 5", async () => {
    const clinic = await createClinic();
    const { patientId, linkCode } = await register(clinic.actor);
    const attacker = await createUser();

    for (let count = 1; count <= 4; count += 1) {
      await link(attacker, WRONG_CODE);
      expect(await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId } })).toMatchObject({
        status: "ACTIVE",
        failedAttempts: count,
      });
    }

    await link(attacker, WRONG_CODE);

    expect(await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId } })).toMatchObject({
      status: "LOCKED",
      failedAttempts: 5,
    });
    expect(await link(await createUser(), linkCode)).toEqual({ ok: false, code: "LINK_FAILED" });
    await expectRejectedBy(
      prismaClient.patientLinkCode.updateMany({ where: { patientId }, data: { failedAttempts: 6 } }),
      "patient_link_codes_failed_attempts_range",
    );
  });

  it("después de bloquearse, un código nuevo sí vincula", async () => {
    const clinic = await createClinic();
    const { patientId } = await register(clinic.actor);
    const attacker = await createUser();
    for (let count = 0; count < 5; count += 1) {
      await link(attacker, WRONG_CODE);
    }

    const renewed = await regenerate({ actor: clinic.actor, patientId });
    const user = await createUser();

    expect(renewed.ok && (await link(user, renewed.linkCode)).ok).toBe(true);
  });
});

describe("límite por cuenta", () => {
  it("con 10 fallos en 15 minutos rechaza antes de evaluar el código correcto", async () => {
    const clinic = await createClinic();
    const { linkCode } = await register(clinic.actor);
    const user = await createUser();
    for (let count = 0; count < 10; count += 1) {
      await link(user, WRONG_CODE, "99999999");
    }

    expect(await link(user, linkCode)).toEqual({ ok: false, code: "TOO_MANY_ATTEMPTS" });
  });

  it("borra las filas de intentos de más de 24 horas al registrar uno nuevo", async () => {
    const user = await createUser();
    const other = await createUser();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prismaClient.patientLinkAttempt.createMany({
      data: [
        { userId: user.id, attemptedAt: old },
        { userId: other.id, attemptedAt: old },
      ],
    });

    await link(user, WRONG_CODE, "99999999");

    // Solo se purga a la cuenta que intenta: la de otra persona se conserva.
    expect(await prismaClient.patientLinkAttempt.count({ where: { userId: user.id } })).toBe(1);
    expect(await prismaClient.patientLinkAttempt.count({ where: { userId: other.id } })).toBe(1);
  });

  it("una ráfaga de pedidos simultáneos de una misma cuenta no supera el límite", async () => {
    const user = await createUser();

    const results = await Promise.all(Array.from({ length: 25 }, () => link(user, WRONG_CODE, "99999999")));

    expect(results.filter((result) => !result.ok && result.code === "TOO_MANY_ATTEMPTS")).toHaveLength(15);
    expect(await prismaClient.patientLinkAttempt.count({ where: { userId: user.id } })).toBe(10);
  });

  it("una ráfaga de cuentas distintas no evalúa un código más de 5 veces", async () => {
    const clinic = await createClinic();
    const { patientId, linkCode } = await register(clinic.actor);
    const attackers = await Promise.all(Array.from({ length: 20 }, () => createUser()));

    await Promise.all(attackers.map((attacker) => link(attacker, WRONG_CODE)));

    // Cinco intentos bastan para bloquearlo: los otros quince ya no lo encontraron.
    expect(await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId } })).toMatchObject({
      status: "LOCKED",
      failedAttempts: 5,
    });
    expect(await link(await createUser(), linkCode)).toEqual({ ok: false, code: "LINK_FAILED" });
  });

  it("un intento exitoso no gasta los intentos del código de otra clínica con el mismo documento", async () => {
    const a = await createClinic();
    const b = await createClinic();
    await register(a.actor);
    const inB = await register(b.actor);

    await link(await createUser(), inB.linkCode);

    expect((await prismaClient.patientLinkCode.findFirstOrThrow({ where: { tenantId: a.tenant.id } })).failedAttempts).toBe(0);
  });

  it("no vincula en una clínica suspendida", async () => {
    const clinic = await createClinic();
    const { patientId, linkCode } = await register(clinic.actor);
    await prismaClient.tenant.update({ where: { id: clinic.tenant.id }, data: { status: "SUSPENDED" } });

    expect(await link(await createUser(), linkCode)).toEqual({ ok: false, code: "LINK_FAILED" });
    expect((await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } })).status).toBe("PENDING");
  });

  it("no guarda documentos, códigos ni clínica en los intentos", async () => {
    const user = await createUser();
    await link(user, WRONG_CODE, "99999999");

    const [attempt] = await prismaClient.patientLinkAttempt.findMany({ where: { userId: user.id } });

    expect(Object.keys(attempt ?? {}).sort()).toEqual(["attemptedAt", "id", "userId"]);
  });
});

describe("el mismo documento en dos clínicas", () => {
  it("el código decide cuál se vincula y la otra queda pendiente", async () => {
    const a = await createClinic();
    const b = await createClinic();
    await register(a.actor);
    const inB = await register(b.actor);
    const user = await createUser();

    const result = await link(user, inB.linkCode);

    expect(result).toMatchObject({ ok: true, tenantId: b.tenant.id });
    expect(await prismaClient.patient.findFirstOrThrow({ where: { tenantId: a.tenant.id } })).toMatchObject({
      status: "PENDING",
      userId: null,
    });
  });

  // Falla si se quita la unión entre el código y su paciente en el SQL de reserva.
  it("el código de un paciente no sirve con el documento de otro de la misma clínica", async () => {
    const clinic = await createClinic();
    const x = await register(clinic.actor, "11111111");
    await register(clinic.actor, "22222222");

    expect(await link(await createUser(), x.linkCode, "22222222")).toEqual({ ok: false, code: "LINK_FAILED" });

    expect((await prismaClient.patient.findUniqueOrThrow({ where: { id: x.patientId } })).status).toBe("PENDING");
    expect(
      (await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId: x.patientId } })).failedAttempts,
    ).toBe(0);
  });

  it("el código de un paciente de una clínica no sirve con el documento de otra clínica", async () => {
    const a = await createClinic();
    const b = await createClinic();
    const x = await register(a.actor, "11111111");
    await register(b.actor, "22222222");

    expect(await link(await createUser(), x.linkCode, "22222222")).toEqual({ ok: false, code: "LINK_FAILED" });

    expect((await prismaClient.patient.findUniqueOrThrow({ where: { id: x.patientId } })).status).toBe("PENDING");
    expect(
      (await prismaClient.patientLinkCode.findFirstOrThrow({ where: { patientId: x.patientId } })).failedAttempts,
    ).toBe(0);
  });

  it("un fallo suma al código de ambas clínicas (costo aceptado y documentado)", async () => {
    const a = await createClinic();
    const b = await createClinic();
    await register(a.actor);
    await register(b.actor);

    await link(await createUser(), WRONG_CODE);

    const codes = await prismaClient.patientLinkCode.findMany();
    expect(codes.map((code) => code.failedAttempts)).toEqual([1, 1]);
  });
});

// Requisito de la constitución: una cuenta en dos clínicas no ve datos de la otra.
describe("una cuenta en dos clínicas", () => {
  it("queda vinculada en cada una por separado y cada clínica ve solo lo suyo", async () => {
    const a = await createClinic();
    const b = await createClinic();
    const inA = await register(a.actor, "12345678");
    const inB = await register(b.actor, "12345678");
    const user = await createUser({ fullName: "Ana Paciente" });

    await link(user, inA.linkCode);
    await link(user, inB.linkCode);

    const records = await prismaClient.patient.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(records.map((record) => record.tenantId).sort()).toEqual([a.tenant.id, b.tenant.id].sort());

    const listA = await listClinicPatients({ actor: a.actor });
    const listB = await listClinicPatients({ actor: b.actor });
    expect(listA.map((patient) => patient.id)).toEqual([inA.patientId]);
    expect(listB.map((patient) => patient.id)).toEqual([inB.patientId]);
    expect(await prismaClient.patientLinkCode.count({ where: { tenantId: a.tenant.id, status: "USED" } })).toBe(1);
  });
});
