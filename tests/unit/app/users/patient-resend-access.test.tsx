import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ requireClinicContext: vi.fn() }));
const studies = vi.hoisted(() => ({ getAssignedPatient: vi.fn(), listStudies: vi.fn() }));
const users = vi.hoisted(() => ({ canResendPatientAccess: vi.fn() }));
vi.mock("@/app/_lib/access", () => access);
vi.mock("@/modules/studies/composition", () => ({ getStudiesModule: () => studies }));
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => users }));
vi.mock("@/app/(dashboard)/_users/_components/resend-access-button", () => {
  function ResendAccessButton() { return <button>Reenviar acceso</button>; }
  return Object.fromEntries([["ResendAccessButton", ResendAccessButton]]);
});
vi.mock("@/app/(dashboard)/_studies/_components/upload-form", () => {
  function UploadForm() { return <div />; }
  return Object.fromEntries([["UploadForm", UploadForm]]);
});
vi.mock("@/app/(dashboard)/_studies/_components/studies-list", () => {
  function StudiesList() { return <div />; }
  return Object.fromEntries([["StudiesList", StudiesList]]);
});

import { PatientStudiesContent } from "@/app/(dashboard)/patients/[patientId]/page";

const patientId = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContext.mockResolvedValue({ status: "ready",
    user: { id: "user-1", email: "medico@example.com", fullName: "Médico", isPlatformAdmin: false },
    clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship: {
      kind: "STAFF", membershipId: "member-1", isDoctor: true, isClinicAdmin: false,
    } },
  });
  studies.getAssignedPatient.mockResolvedValue({ fullName: "Paciente", documentNumber: "123" });
  studies.listStudies.mockResolvedValue({ items: [], page: 1, totalPages: 1 });
  users.canResendPatientAccess.mockResolvedValue(true);
});

async function render() {
  return renderToStaticMarkup(await PatientStudiesContent({
    params: Promise.resolve({ patientId }), searchParams: Promise.resolve({}),
  }));
}

describe("reenvío desde el detalle del paciente", () => {
  it("muestra el botón solo cuando el caso de uso confirma asignación vigente y sin sesiones", async () => {
    expect(await render()).toContain("Reenviar acceso");
    expect(users.canResendPatientAccess).toHaveBeenCalledWith({
      actor: expect.objectContaining({ tenantId: "tenant-1", membershipId: "member-1" }), patientId,
    });
    users.canResendPatientAccess.mockResolvedValueOnce(false);
    expect(await render()).not.toContain("Reenviar acceso");
  });
});
