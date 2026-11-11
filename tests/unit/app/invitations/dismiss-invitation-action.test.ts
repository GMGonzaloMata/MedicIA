import { beforeEach, describe, expect, it, vi } from "vitest";

const invitationCookie = vi.hoisted(() => ({ clear: vi.fn() }));

vi.mock("@/app/_lib/invitation-cookie", () => ({ clearInvitationCookie: invitationCookie.clear }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { dismissInvitation } from "@/app/(dashboard)/_invitations/_actions/dismiss-invitation";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("acción de olvidar la invitación pendiente", () => {
  it("borra la cookie y lleva al inicio", async () => {
    await expect(dismissInvitation()).rejects.toThrow("REDIRECT:/");

    expect(invitationCookie.clear).toHaveBeenCalledTimes(1);
  });
});
