import { beforeEach, describe, expect, it } from "vitest";

import { createLinkPatientAccount } from "@/modules/tenants/application/use-cases/link-patient-account";
import { createRegeneratePatientLinkCode } from "@/modules/tenants/application/use-cases/regenerate-patient-link-code";
import { createRegisterPatient } from "@/modules/tenants/application/use-cases/register-patient";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";

import { createDeterministicSecretGenerator } from "../../../../support/in-memory/deterministic-secret-generator";
import { createInMemoryClinicStore } from "../../../../support/in-memory/in-memory-clinic-store";
import { createInMemoryLinkAttemptRepository } from "../../../../support/in-memory/in-memory-link-attempt-repository";
import { createInMemoryPatientRegistry } from "../../../../support/in-memory/in-memory-patient-registry-repository";

const START = new Date("2026-11-23T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN = { isClinicAdmin: true, isDoctor: false };

const ACTOR_A: ClinicAdminActor = { tenantId: "tenant-a", userId: "admin-a", membershipId: "membership-admin-a" };
const ACTOR_B: ClinicAdminActor = { tenantId: "tenant-b", userId: "admin-b", membershipId: "membership-admin-b" };
const USER = { id: "user-1", fullName: "Ana Paciente" };
const WRONG_CODE = "ZZZZZ-ZZZZZ";

let currentTime = START;

function setup() {
  currentTime = START;
  const clinic = createInMemoryClinicStore();
  clinic.addTenant({ id: "tenant-a", name: "Clínica A" });
  clinic.addTenant({ id: "tenant-b", name: "Clínica B" });
  clinic.addUser({ id: "admin-a", email: "admin-a@example.com" });
  clinic.addUser({ id: "admin-b", email: "admin-b@example.com" });
  clinic.addMembership({ tenantId: "tenant-a", userId: "admin-a", roles: ADMIN });
  clinic.addMembership({ tenantId: "tenant-b", userId: "admin-b", roles: ADMIN });

  const attempts = createInMemoryLinkAttemptRepository();
  const registry = createInMemoryPatientRegistry(clinic, attempts.attempts);
  const secrets = createDeterministicSecretGenerator();
  const now = () => currentTime;

  return {
    registry,
    attempts,
    registerPatient: createRegisterPatient({ patients: registry.repository, staff: clinic.staff, secrets, now }),
    regenerate: createRegeneratePatientLinkCode({ patients: registry.repository, secrets, now }),
    link: createLinkPatientAccount({ patients: registry.repository, attempts, secrets, now }),
  };
}

let world: ReturnType<typeof setup>;

beforeEach(() => {
  world = setup();
});

async function register(actor = ACTOR_A, documentNumber = "12345678") {
  const result = await world.registerPatient({ actor, documentType: "DNI", documentNumber });

  if (!result.ok) {
    throw new Error("No se pudo registrar al paciente de prueba.");
  }

  return result;
}

const attempt = (code: string, overrides: Partial<{ documentNumber: string; user: typeof USER }> = {}) =>
  world.link({ user: USER, documentType: "DNI", documentNumber: "12345678", code, ...overrides });

describe("vinculación correcta", () => {
  it("asocia la cuenta, completa el nombre, pasa a vinculado y usa el código", async () => {
    const { patientId, linkCode } = await register();

    expect(await attempt(linkCode)).toEqual({ ok: true, tenantId: "tenant-a", patientId });
    expect(world.registry.patients[0]).toMatchObject({ status: "LINKED", userId: "user-1", fullName: "Ana Paciente" });
    expect(world.registry.codes[0]?.status).toBe("USED");
  });

  it("acepta el documento con puntos y el código en minúsculas y sin guion", async () => {
    const { linkCode } = await register();

    expect((await attempt(linkCode.replace("-", "").toLowerCase(), { documentNumber: "12.345.678" })).ok).toBe(true);
  });

  it("borra los intentos fallidos anteriores de la cuenta", async () => {
    const { linkCode } = await register();
    await attempt(WRONG_CODE);
    await attempt(WRONG_CODE);

    await attempt(linkCode);

    expect(world.attempts.attempts).toHaveLength(0);
  });

  it("con el mismo documento en dos clínicas, el código decide cuál", async () => {
    await register(ACTOR_A);
    const inB = await register(ACTOR_B);

    expect(await attempt(inB.linkCode)).toMatchObject({ ok: true, tenantId: "tenant-b", patientId: inB.patientId });
    expect(world.registry.patients.find((row) => row.tenantId === "tenant-a")?.status).toBe("PENDING");
  });

  it("el mismo código no se puede usar dos veces", async () => {
    const { linkCode } = await register();
    await attempt(linkCode);

    expect(await attempt(linkCode, { user: { id: "user-2", fullName: "Otra" } })).toEqual({ ok: false, code: "LINK_FAILED" });
    expect(world.registry.patients[0]?.userId).toBe("user-1");
  });
});

describe("el mismo rechazo para cualquier causa", () => {
  const LINK_FAILED = { ok: false, code: "LINK_FAILED" };

  it("documento inexistente", async () => {
    const { linkCode } = await register();

    expect(await attempt(linkCode, { documentNumber: "99999999" })).toEqual(LINK_FAILED);
  });

  it("código incorrecto", async () => {
    await register();

    expect(await attempt(WRONG_CODE)).toEqual(LINK_FAILED);
  });

  it("código vencido", async () => {
    const { linkCode } = await register();
    currentTime = new Date(START.getTime() + 8 * DAY_MS);

    expect(await attempt(linkCode)).toEqual(LINK_FAILED);
  });

  it("código usado", async () => {
    const { linkCode } = await register();
    await attempt(linkCode);

    expect(await attempt(linkCode, { user: { id: "user-2", fullName: "Otra" } })).toEqual(LINK_FAILED);
  });

  it("código reemplazado", async () => {
    const first = await register();
    await world.regenerate({ actor: ACTOR_A, patientId: first.patientId });

    expect(await attempt(first.linkCode)).toEqual(LINK_FAILED);
  });

  it("código bloqueado", async () => {
    const { linkCode } = await register();
    for (let count = 0; count < 5; count += 1) {
      await attempt(WRONG_CODE, { user: { id: `intruso-${count}`, fullName: "x" } });
    }

    expect(await attempt(linkCode)).toEqual(LINK_FAILED);
  });

  it("cuenta que ya es paciente de esa clínica", async () => {
    const first = await register(ACTOR_A, "11111111");
    await attempt(first.linkCode, { documentNumber: "11111111" });
    const second = await register(ACTOR_A, "22222222");

    expect(await attempt(second.linkCode, { documentNumber: "22222222" })).toEqual(LINK_FAILED);
    expect(world.registry.patients.find((row) => row.documentNumber === "22222222")?.status).toBe("PENDING");
  });
});

describe("cinco fallos bloquean el código", () => {
  it("al quinto fallo el código queda bloqueado y el correcto ya no sirve", async () => {
    const { linkCode } = await register();

    for (let count = 1; count <= 4; count += 1) {
      await attempt(WRONG_CODE, { user: { id: `intruso-${count}`, fullName: "x" } });
      expect(world.registry.codes[0]).toMatchObject({ status: "ACTIVE", failedAttempts: count });
    }

    await attempt(WRONG_CODE, { user: { id: "intruso-5", fullName: "x" } });
    expect(world.registry.codes[0]).toMatchObject({ status: "LOCKED", failedAttempts: 5 });
    expect(await attempt(linkCode)).toEqual({ ok: false, code: "LINK_FAILED" });
  });

  it("el administrador genera uno nuevo y ese sí sirve", async () => {
    const first = await register();
    for (let count = 0; count < 5; count += 1) {
      await attempt(WRONG_CODE, { user: { id: `intruso-${count}`, fullName: "x" } });
    }

    const renewed = await world.regenerate({ actor: ACTOR_A, patientId: first.patientId });

    expect(renewed.ok && (await attempt(renewed.linkCode)).ok).toBe(true);
  });

  it("un fallo con un documento sin candidatos no toca ningún código", async () => {
    await register();

    await attempt(WRONG_CODE, { documentNumber: "99999999" });

    expect(world.registry.codes[0]?.failedAttempts).toBe(0);
  });
});

describe("límite por cuenta", () => {
  it("con 10 fallos en 15 minutos se frena antes de evaluar el código, aunque sea el correcto", async () => {
    const { linkCode } = await register();
    for (let count = 0; count < 10; count += 1) {
      await attempt(WRONG_CODE, { documentNumber: "99999999" });
    }

    expect(await attempt(linkCode)).toEqual({ ok: false, code: "TOO_MANY_ATTEMPTS" });
    expect(world.registry.patients[0]?.status).toBe("PENDING");
  });

  it("pasados los 15 minutos la cuenta vuelve a poder intentar", async () => {
    const { linkCode } = await register();
    for (let count = 0; count < 10; count += 1) {
      await attempt(WRONG_CODE, { documentNumber: "99999999" });
    }
    currentTime = new Date(START.getTime() + 16 * MINUTE_MS);

    expect((await attempt(linkCode)).ok).toBe(true);
  });

  it("los intentos de más de 24 horas se borran al registrar uno nuevo", async () => {
    await attempt(WRONG_CODE, { documentNumber: "99999999" });
    currentTime = new Date(START.getTime() + 25 * 60 * MINUTE_MS);

    await attempt(WRONG_CODE, { documentNumber: "99999999" });

    expect(world.attempts.attempts).toEqual([currentTime]);
  });
});

describe("entrada con forma inválida", () => {
  it.each([
    { $name: "código con largo incorrecto", input: { code: "ABC" } },
    { $name: "código con símbolos ambiguos", input: { code: "00000-00000" } },
    { $name: "documento vacío", input: { documentNumber: " - " } },
    { $name: "tipo de documento desconocido", input: { documentType: "CUIT" } },
  ])("$name devuelve INVALID_INPUT y no cuenta como intento", async ({ input }) => {
    await register();

    const result = await world.link({
      user: USER,
      documentType: "DNI",
      documentNumber: "12345678",
      code: WRONG_CODE,
      ...input,
    });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(world.attempts.attempts).toHaveLength(0);
    expect(world.registry.codes[0]?.failedAttempts).toBe(0);
  });
});
