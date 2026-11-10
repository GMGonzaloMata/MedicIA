import { describe, expect, it } from "vitest";

import { fakeSubjectForEmail } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

import { DEMO_PEOPLE, DEMO_TENANTS, fakeSubject } from "../../../scripts/seed-demo-clinic.ts";

describe("script de datos de prueba", () => {
  it("calcula el mismo identificador por correo que el proveedor de identidad simulado", () => {
    for (const person of Object.values(DEMO_PEOPLE)) {
      expect(fakeSubject(person.email)).toBe(fakeSubjectForEmail(person.email));
    }
  });

  it("usa correos únicos y dos clínicas distintas", () => {
    const emails = Object.values(DEMO_PEOPLE).map((person) => person.email);

    expect(new Set(emails).size).toBe(emails.length);
    expect(DEMO_TENANTS.a).not.toBe(DEMO_TENANTS.b);
  });
});
