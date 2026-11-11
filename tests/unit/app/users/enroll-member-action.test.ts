import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const users = vi.hoisted(() => ({ enrollMember: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/app/_lib/access", () => access);
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => users }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

import { enrollMember } from "@/app/(dashboard)/_users/_actions/enroll-member";

function form(kind: "DOCTOR" | "PATIENT" = "PATIENT") {
  const data = new FormData();
  const values = { kind, email: "persona@example.com", fullName: "Persona Nueva",
    documentType: "DNI", documentNumber: "12345678", licenseNumber: "MP-123", specialty: "Cardiología" };
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  data.set("tenantId", "otra-clinica");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: true, context: {
    status: "ready", user: { id: "user-1" },
    clinic: { tenantId: "tenant-1", relationship: {
      kind: "STAFF", membershipId: "member-1", isClinicAdmin: true, isDoctor: false,
    } },
  } });
  users.enrollMember.mockResolvedValue({ status: "ENROLLED", kind: "PATIENT", relationshipId: "patient-1",
    assignedToDoctor: false, mail: "SENT" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de alta", () => {
  it("usa solo la clínica autenticada y confirma igual para cuenta nueva o existente", async () => {
    const first = await enrollMember(undefined, form());
    const call = users.enrollMember.mock.calls[0]?.[0];
    expect(call.actor.tenantId).toBe("tenant-1");
    expect(call).not.toHaveProperty("tenantId");
    users.enrollMember.mockResolvedValueOnce({ status: "ENROLLED", kind: "PATIENT",
      relationshipId: "patient-2", assignedToDoctor: false, mail: "SENT" });
    const second = await enrollMember(undefined, form());
    expect(first).toEqual(second);
    expect(revalidatePath).toHaveBeenCalledWith("/users");
  });

  it("rechaza ausencia de actor y tipo médico para actor médico", async () => {
    access.requireClinicContextForAction.mockResolvedValueOnce({ isAuthorized: false, reason: "no-clinic" });
    expect(await enrollMember(undefined, form())).toMatchObject({ status: "error" });
    access.requireClinicContextForAction.mockResolvedValueOnce({ isAuthorized: false, reason: "anonymous" });
    await expect(enrollMember(undefined, form())).rejects.toThrow("REDIRECT:/sign-in");
    access.requireClinicContextForAction.mockResolvedValueOnce({ isAuthorized: true, context: {
      status: "ready", user: { id: "doctor-1" }, clinic: { tenantId: "tenant-1", relationship: {
        kind: "STAFF", membershipId: "doctor-member", isClinicAdmin: false, isDoctor: true,
      } },
    } });
    expect(await enrollMember(undefined, form("DOCTOR"))).toMatchObject({ status: "error" });
    expect(users.enrollMember).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("no registra datos sensibles en una falla", async () => {
    users.enrollMember.mockRejectedValueOnce(new Error("documento secreto 12345678"));
    expect(await enrollMember(undefined, form())).toMatchObject({ status: "error" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("12345678");
  });
});
