import { beforeEach, describe, expect, it } from "vitest";

import { createEnrollmentScenario, NEW_PATIENT } from "../../support/enrollment-scenario";
import { prismaClient, resetDatabase } from "../../support/database";

beforeEach(resetDatabase);

describe("altas simultáneas", () => {
  it("dos altas del mismo correo dejan una cuenta y un vínculo", async () => {
    const test = await createEnrollmentScenario();
    const results = await Promise.all([
      test.enroll({ actor: test.actor, ...NEW_PATIENT }),
      test.enroll({ actor: test.actor, ...NEW_PATIENT }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["ALREADY_MEMBER", "ENROLLED"]);
    expect(await prismaClient.user.count({ where: { email: NEW_PATIENT.email } })).toBe(1);
    expect(await prismaClient.patient.count({ where: { tenantId: test.tenant.id } })).toBe(1);
  });

  it("dos correos con el mismo documento dejan un registro y un conflicto", async () => {
    const test = await createEnrollmentScenario();
    const results = await Promise.all([
      test.enroll({ actor: test.actor, ...NEW_PATIENT }),
      test.enroll({ actor: test.actor, ...NEW_PATIENT, email: "otro@example.com" }),
    ]);
    expect(results).toContainEqual({ status: "CONFLICT", reason: "DOCUMENT_IN_USE" });
    expect(results.some((result) => result.status === "ENROLLED")).toBe(true);
    expect(await prismaClient.patient.count({ where: { tenantId: test.tenant.id } })).toBe(1);
  });
});
