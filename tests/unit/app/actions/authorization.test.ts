import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicUnavailableError } from "@/modules/users/domain/clinic-errors";
import { generateSessionToken } from "@/modules/users/domain/session-token";
import { SESSION_COOKIE_NAME } from "@/shared/constants/session-cookie";

const cookieStore = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
  delete: vi.fn(),
}));

const usersModule = vi.hoisted(() => ({
  getAccessContext: vi.fn(),
  selectActiveClinic: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "medicia-session" && cookieStore.value ? { value: cookieStore.value } : undefined),
    set: cookieStore.set,
    delete: cookieStore.delete,
  }),
}));

// `redirect` real lanza una excepción para cortar la ejecución; el doble hace lo mismo.
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => usersModule }));

import { signIn } from "@/app/(auth)/_actions/sign-in";
import { selectClinic } from "@/app/(dashboard)/_actions/select-clinic";
import { signOut } from "@/app/(dashboard)/_actions/sign-out";

const MEMBERSHIP_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const READY_CONTEXT = {
  status: "ready",
  user: { id: "user-1", email: "persona@example.com", fullName: "Persona", isPlatformAdmin: false },
  clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship: { kind: "PATIENT", patientId: "p-1" } },
};

function formWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

async function redirectedTo(action: Promise<unknown>): Promise<string | null> {
  try {
    await action;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    return message.startsWith("REDIRECT:") ? message.slice("REDIRECT:".length) : null;
  }

  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.value = undefined;
});

describe("selectClinic", () => {
  it("sin sesión no llama al caso de uso y lleva al ingreso", async () => {
    usersModule.getAccessContext.mockResolvedValue({ status: "anonymous" });

    const path = await redirectedTo(selectClinic(undefined, formWith({ relationship: `STAFF:${MEMBERSHIP_ID}` })));

    expect(path).toBe("/sign-in");
    expect(usersModule.selectActiveClinic).not.toHaveBeenCalled();
  });

  it("con una sesión que ya no es vigente responde con el mensaje de clínica no disponible", async () => {
    cookieStore.value = generateSessionToken();
    usersModule.getAccessContext.mockResolvedValue(READY_CONTEXT);
    usersModule.selectActiveClinic.mockRejectedValue(new ClinicUnavailableError());

    const state = await selectClinic(undefined, formWith({ relationship: `STAFF:${MEMBERSHIP_ID}` }));

    expect(state).toEqual({ message: "No podés usar esa clínica en este momento." });
  });

  it("ignora un tenantId enviado por el cliente y usa solo el vínculo", async () => {
    const token = generateSessionToken();
    cookieStore.value = token;
    usersModule.getAccessContext.mockResolvedValue(READY_CONTEXT);
    usersModule.selectActiveClinic.mockResolvedValue(undefined);

    const path = await redirectedTo(
      selectClinic(undefined, formWith({ relationship: `STAFF:${MEMBERSHIP_ID}`, tenantId: "tenant-ajeno" })),
    );

    expect(path).toBe("/");
    expect(usersModule.selectActiveClinic).toHaveBeenCalledExactlyOnceWith({
      token,
      kind: "STAFF",
      relationshipId: MEMBERSHIP_ID,
    });
  });

  it.each(["", "tenant-ajeno", "STAFF:no-es-un-uuid", `OTRO:${MEMBERSHIP_ID}`])(
    "rechaza el valor inválido %j sin llamar al caso de uso",
    async (relationship) => {
      cookieStore.value = generateSessionToken();
      usersModule.getAccessContext.mockResolvedValue(READY_CONTEXT);

      const state = await selectClinic(undefined, formWith({ relationship }));

      expect(state).toEqual({ message: "No podés usar esa clínica en este momento." });
      expect(usersModule.selectActiveClinic).not.toHaveBeenCalled();
    },
  );
});

describe("signOut", () => {
  it("sin sesión no falla, borra la cookie y lleva al ingreso", async () => {
    usersModule.signOut.mockResolvedValue(undefined);

    const path = await redirectedTo(signOut());

    expect(path).toBe("/sign-in");
    expect(usersModule.signOut).toHaveBeenCalledWith(null);
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("borra la cookie y redirige aunque la base falle", async () => {
    cookieStore.value = generateSessionToken();
    usersModule.signOut.mockRejectedValue(new Error("base caída"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const path = await redirectedTo(signOut());

    expect(path).toBe("/sign-in");
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(logged).toHaveBeenCalledWith(expect.not.stringContaining("base caída"));
  });
});

describe("signIn", () => {
  const credentials = { email: "persona@example.com", password: "contraseña-larga-123" };
  const session = { token: generateSessionToken(), expiresAt: new Date(Date.now() + 60_000) };

  it.each(["https://example.com/robo", "//example.com"])(
    "con el destino externo %s redirige al inicio",
    async (next) => {
      usersModule.signIn.mockResolvedValue({ ...session, nextStep: "HOME" });

      const path = await redirectedTo(signIn(undefined, formWith({ ...credentials, next })));

      expect(path).toBe("/");
    },
  );

  it("solo respeta el destino si ya hay una clínica activa", async () => {
    usersModule.signIn.mockResolvedValue({ ...session, nextStep: "SELECT_CLINIC" });
    expect(await redirectedTo(signIn(undefined, formWith({ ...credentials, next: "/estudios" })))).toBe(
      "/select-clinic",
    );

    usersModule.signIn.mockResolvedValue({ ...session, nextStep: "NO_ACCESS" });
    expect(await redirectedTo(signIn(undefined, formWith({ ...credentials, next: "/estudios" })))).toBe(
      "/no-access",
    );

    usersModule.signIn.mockResolvedValue({ ...session, nextStep: "HOME" });
    expect(await redirectedTo(signIn(undefined, formWith({ ...credentials, next: "/estudios" })))).toBe(
      "/estudios",
    );
  });
});
