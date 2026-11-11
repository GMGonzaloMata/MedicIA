import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const users = vi.hoisted(() => ({ resendAccess: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/app/_lib/access", () => access);
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => users }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

import { resendAccess } from "@/app/(dashboard)/_users/_actions/resend-access";

const patientId = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
function form(id = patientId) {
  const data = new FormData();
  data.set("kind", "PATIENT"); data.set("patientId", id); data.set("tenantId", "otra");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: true, context: {
    status: "ready", user: { id: "user-1" }, clinic: { tenantId: "tenant-1", relationship: {
      kind: "STAFF", membershipId: "member-1", isClinicAdmin: true, isDoctor: false,
    } },
  } });
  users.resendAccess.mockResolvedValue({ status: "SENT" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de reenviar acceso", () => {
  it("valida el identificador, usa el actor y actualiza la lista", async () => {
    expect(await resendAccess(undefined, form())).toMatchObject({ status: "success" });
    expect(users.resendAccess).toHaveBeenCalledWith({ actor: expect.objectContaining({ tenantId: "tenant-1" }),
      target: { kind: "PATIENT", patientId } });
    expect(revalidatePath).toHaveBeenCalledWith("/users");
    expect(await resendAccess(undefined, form("no-uuid"))).toMatchObject({ status: "error" });
    expect(users.resendAccess).toHaveBeenCalledTimes(1);
  });

  it("sin actor no delega", async () => {
    access.requireClinicContextForAction.mockResolvedValueOnce({ isAuthorized: false, reason: "no-clinic" });
    expect(await resendAccess(undefined, form())).toMatchObject({ status: "error" });
    expect(users.resendAccess).not.toHaveBeenCalled();
  });

  it("no escribe datos de la falla en la consola", async () => {
    users.resendAccess.mockRejectedValueOnce(new Error("código secreto 999999"));
    expect(await resendAccess(undefined, form())).toMatchObject({ status: "error" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("999999");
  });
});
