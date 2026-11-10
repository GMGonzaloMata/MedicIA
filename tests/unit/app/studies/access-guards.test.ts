import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const ACTIONS = [
  "src/app/(dashboard)/_studies/_actions/upload-study.ts",
  "src/app/(dashboard)/_studies/_actions/delete-study.ts",
];
const SCREENS = [
  "src/app/(dashboard)/studies/page.tsx",
  "src/app/(dashboard)/patients/page.tsx",
  "src/app/(dashboard)/patients/[patientId]/page.tsx",
];

// Cada acción y cada pantalla comprueban la sesión por su cuenta: una acción se puede invocar con un POST
// directo y el `proxy` solo hace una decisión optimista por ruta.
describe("las acciones y pantallas de estudios comprueban el acceso por su cuenta", () => {
  it.each(ACTIONS)("la acción %s llama a requireClinicContextForAction", (path) => {
    expect(read(path)).toContain("requireClinicContextForAction()");
  });

  it.each(SCREENS)("la pantalla %s llama a requireClinicContext", (path) => {
    expect(read(path)).toContain("requireClinicContext()");
  });

  it.each(SCREENS)("la pantalla %s traduce el vínculo a un actor y no confía en datos del cliente", (path) => {
    const source = read(path);

    expect(source).toContain("toStudyActor(");
    expect(source).not.toMatch(/searchParams[^;]*tenantId/);
  });

  it("las pantallas muestran el aviso al administrador que no es médico y ningún dato", () => {
    for (const path of SCREENS) {
      expect(read(path)).toContain("STUDY_MESSAGES.adminWithoutStudies");
    }
  });

  it("las pantallas redirigen según el rol: el paciente a /studies y el médico a /patients", () => {
    expect(read(SCREENS[0] as string)).toContain('redirect("/patients")');
    expect(read(SCREENS[1] as string)).toContain('redirect("/studies")');
    expect(read(SCREENS[2] as string)).toContain('redirect("/studies")');
  });

  it("los vínculos «Mis estudios» y «Mis pacientes» se muestran solo al rol que corresponde", () => {
    for (const path of ["src/app/(dashboard)/_components/clinic-header.tsx", "src/app/(dashboard)/page.tsx"]) {
      const source = read(path);

      expect(source).toMatch(/kind === "PATIENT" \? \([\s\S]*?Mis estudios/);
      expect(source).toMatch(/isDoctor \? \([\s\S]*?Mis pacientes/);
    }
  });
});
