import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersContent } from "@/app/(dashboard)/_users/_components/users-content";
import type { ReadyAccessContext } from "@/app/_lib/access";

const mocked = vi.hoisted(() => ({
  context: vi.fn(),
  listStaff: vi.fn(),
  listPatients: vi.fn(),
}));

vi.mock("@/app/_lib/access", () => ({ requireClinicContext: mocked.context }));
vi.mock("@/modules/users/composition", () => ({
  getUsersModule: () => ({ listClinicStaff: mocked.listStaff, listClinicPatients: mocked.listPatients }),
}));

const adminContext: ReadyAccessContext = {
  status: "ready",
  user: { id: "user-1", email: "admin@example.com", fullName: "Ana Admin", isPlatformAdmin: false },
  clinic: {
    tenantId: "tenant-1",
    tenantName: "Clínica del Sol",
    relationship: { kind: "STAFF", membershipId: "member-1", isClinicAdmin: true, isDoctor: false },
  },
};

async function renderUsers(tab: "staff" | "patients" = "staff"): Promise<string> {
  return renderToStaticMarkup(await UsersContent({ searchParams: Promise.resolve({ tab, page: "1" }) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.context.mockResolvedValue(adminContext);
  mocked.listStaff.mockResolvedValue({
    status: "OK",
    items: [{
      membershipId: "member-1", fullName: "Ana Admin", email: "admin@example.com",
      isClinicAdmin: true, isDoctor: false, specialty: null, licenseNumber: null,
      status: "ACTIVE", canResendAccess: false,
    }],
    total: 1, page: 1, pageSize: 25,
  });
  mocked.listPatients.mockResolvedValue({
    status: "OK",
    items: [{
      patientId: "patient-1", fullName: "Pedro Paciente", documentType: "DNI",
      documentNumber: "30111222", status: "LINKED", doctors: [], canResendAccess: true,
    }],
    total: 1, page: 1, pageSize: 25,
  });
});

describe("pantalla de usuarios", () => {
  it("el administrador ve su lista de personal y puede elegir pacientes", async () => {
    const staff = await renderUsers();
    const patients = await renderUsers("patients");

    expect(staff).toContain("Ana Admin");
    expect(staff).toContain("Activo");
    expect(staff).toContain("?tab=patients&amp;page=1");
    expect(patients).toContain("Pedro Paciente");
    expect(patients).toContain("Vinculado");
    expect(mocked.listStaff).toHaveBeenCalledOnce();
    expect(mocked.listPatients).toHaveBeenCalledOnce();
  });

  it("un médico y un paciente no ven listas ni provocan consultas", async () => {
    mocked.context.mockResolvedValueOnce({
      ...adminContext,
      clinic: {
        ...adminContext.clinic,
        relationship: { kind: "STAFF", membershipId: "doctor-1", isClinicAdmin: false, isDoctor: true },
      },
    });
    mocked.context.mockResolvedValueOnce({
      ...adminContext,
      clinic: { ...adminContext.clinic, relationship: { kind: "PATIENT", patientId: "patient-1" } },
    });

    expect(await renderUsers()).toContain("No tenés permiso");
    expect(await renderUsers("patients")).toContain("No tenés permiso");
    expect(mocked.listStaff).not.toHaveBeenCalled();
    expect(mocked.listPatients).not.toHaveBeenCalled();
  });

  it("ofrece volver al inicio cuando la página pedida no tiene filas", async () => {
    mocked.listPatients.mockResolvedValue({ status: "OK", items: [], total: 1, page: 100, pageSize: 25 });

    const html = await renderUsers("patients");

    expect(html).toContain("No hay personas en esta página");
    expect(html).toContain("/users?tab=patients&amp;page=1");
    expect(html).toContain("Ir a la primera página");
  });
});
