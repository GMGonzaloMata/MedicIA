import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateInvitationToken } from "@/modules/users/domain/invitation-token";
import { INVITATION_COOKIE_MAX_AGE_SECONDS, INVITATION_COOKIE_NAME } from "@/shared/constants/invitation-cookie";

const cookieStore = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "medicia_invitation" && cookieStore.value ? { value: cookieStore.value } : undefined),
    set: cookieStore.set,
    delete: cookieStore.delete,
  }),
}));

import { clearInvitationCookie, readInvitationToken, setInvitationCookie } from "@/app/_lib/invitation-cookie";

beforeEach(() => {
  vi.resetAllMocks();
  cookieStore.value = undefined;
});

describe("cookie de la invitación", () => {
  it("guarda el token con las opciones de una cookie de sesión, por 2 horas", async () => {
    const token = generateInvitationToken();

    await setInvitationCookie(token);

    expect(cookieStore.set).toHaveBeenCalledWith(INVITATION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: INVITATION_COOKIE_MAX_AGE_SECONDS,
    });
    expect(INVITATION_COOKIE_MAX_AGE_SECONDS).toBe(7200);
  });

  it("solo es segura en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await setInvitationCookie(generateInvitationToken());

    expect(cookieStore.set.mock.calls[0]?.[2]).toMatchObject({ secure: true });
    vi.unstubAllEnvs();
  });

  it("devuelve el token solo si tiene la forma esperada", async () => {
    const token = generateInvitationToken();
    cookieStore.value = token;
    expect(await readInvitationToken()).toBe(token);

    cookieStore.value = "valor-manipulado";
    expect(await readInvitationToken()).toBeNull();

    cookieStore.value = undefined;
    expect(await readInvitationToken()).toBeNull();
  });

  it("la borra", async () => {
    await clearInvitationCookie();

    expect(cookieStore.delete).toHaveBeenCalledWith(INVITATION_COOKIE_NAME);
  });
});
