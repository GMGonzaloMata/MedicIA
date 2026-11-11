import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateInvitationToken } from "@/modules/users/domain/invitation-token";

const invitationCookie = vi.hoisted(() => ({ token: null as string | null }));
const usersModule = vi.hoisted(() => ({ signIn: vi.fn() }));

vi.mock("@/app/_lib/invitation-cookie", () => ({ readInvitationToken: async () => invitationCookie.token }));
vi.mock("@/app/_lib/session-cookie", () => ({ setSessionCookie: vi.fn() }));
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => usersModule }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { signIn } from "@/app/(auth)/_actions/sign-in";

function credentials(next?: string): FormData {
  const formData = new FormData();
  formData.set("email", "persona@example.com");
  formData.set("password", "Contraseña-Segura1");

  if (next) {
    formData.set("next", next);
  }

  return formData;
}

async function destination(formData: FormData): Promise<string | null> {
  try {
    await signIn(undefined, formData);

    return null;
  } catch (error) {
    return error instanceof Error && error.message.startsWith("REDIRECT:") ? error.message.slice("REDIRECT:".length) : null;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  invitationCookie.token = null;
});

describe("ingreso con una invitación pendiente", () => {
  it.each([
    ["con una clínica activa", "HOME"],
    ["debiendo elegir entre varias clínicas", "SELECT_CLINIC"],
    ["sin ninguna clínica", "NO_ACCESS"],
  ])("lleva a la invitación %s", async (description, nextStep) => {
    invitationCookie.token = generateInvitationToken();
    usersModule.signIn.mockResolvedValue({ token: "sesion", expiresAt: new Date(), nextStep });

    expect(await destination(credentials("/studies"))).toBe("/invitation");
  });

  it.each([
    ["HOME", "/studies"],
    ["SELECT_CLINIC", "/select-clinic"],
    ["NO_ACCESS", "/no-access"],
  ])("sin invitación mantiene el destino de siempre (%s)", async (nextStep, expected) => {
    usersModule.signIn.mockResolvedValue({ token: "sesion", expiresAt: new Date(), nextStep });

    expect(await destination(credentials("/studies"))).toBe(expected);
  });
});
