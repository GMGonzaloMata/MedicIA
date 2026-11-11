import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateInvitationToken } from "@/modules/users/domain/invitation-token";

const access = vi.hoisted(() => ({ getAccessContext: vi.fn() }));
const invitationCookie = vi.hoisted(() => ({
  token: null as string | null,
  clear: vi.fn(),
}));
const usersModule = vi.hoisted(() => ({ acceptInvitation: vi.fn(), selectActiveClinic: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/access", () => access);
vi.mock("@/app/_lib/invitation-cookie", () => ({
  readInvitationToken: async () => invitationCookie.token,
  clearInvitationCookie: invitationCookie.clear,
}));
vi.mock("@/app/_lib/session-cookie", () => ({ readSessionToken: async () => "sesion-1" }));
vi.mock("@/modules/users/composition", () => ({ getUsersModule: () => usersModule }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { acceptInvitation } from "@/app/(dashboard)/_invitations/_actions/accept-invitation";

const COOKIE_TOKEN = generateInvitationToken();
const READY = {
  status: "ready",
  user: { id: "user-1", email: "dra.perez@example.com", fullName: "Dra. Pérez", isPlatformAdmin: false },
  clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship: { kind: "PATIENT", patientId: "p-1" } },
};

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

const DOCTOR_FORM = { licenseNumber: "MN123", specialty: "Cardiología" };

async function redirectedTo(action: Promise<unknown>): Promise<string | null> {
  try {
    await action;

    return null;
  } catch (error) {
    return error instanceof Error && error.message.startsWith("REDIRECT:") ? error.message.slice("REDIRECT:".length) : null;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  invitationCookie.token = COOKIE_TOKEN;
  access.getAccessContext.mockResolvedValue(READY);
  usersModule.selectActiveClinic.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de aceptar una invitación", () => {
  it("sin sesión redirige a ingresar y no acepta nada", async () => {
    access.getAccessContext.mockResolvedValue({ status: "anonymous" });

    expect(await redirectedTo(acceptInvitation(undefined, form(DOCTOR_FORM)))).toBe("/sign-in");
    expect(usersModule.acceptInvitation).not.toHaveBeenCalled();
  });

  it("también acepta a quien todavía no tiene una clínica activa", async () => {
    access.getAccessContext.mockResolvedValue({ status: "no-clinic", user: READY.user });
    usersModule.acceptInvitation.mockResolvedValue({ status: "INVALID" });

    await acceptInvitation(undefined, form(DOCTOR_FORM));

    expect(usersModule.acceptInvitation).toHaveBeenCalled();
  });

  it("toma el token de la cookie y nunca del formulario", async () => {
    usersModule.acceptInvitation.mockResolvedValue({ status: "INVALID" });

    await acceptInvitation(undefined, form({ ...DOCTOR_FORM, token: "otro-token", tenantId: "otra-clinica" }));

    const call = usersModule.acceptInvitation.mock.calls[0]?.[0];
    expect(call.token).toBe(COOKIE_TOKEN);
    expect(call.account).toEqual({ id: "user-1", email: "dra.perez@example.com", fullName: "Dra. Pérez" });
    expect(call.proof).toEqual({ licenseNumber: "MN123", specialty: "Cardiología" });
    expect(Object.keys(call).sort()).toEqual(["account", "proof", "token"]);
  });

  it("sin cookie responde que la invitación no es válida, sin consultar nada", async () => {
    invitationCookie.token = null;

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toMatchObject({ status: "finished" });
    expect(usersModule.acceptInvitation).not.toHaveBeenCalled();
  });

  it("valida los campos antes de llamar al caso de uso", async () => {
    const result = await acceptInvitation(undefined, form({ licenseNumber: " . ", specialty: "C" }));

    expect(result).toMatchObject({ status: "error", fieldErrors: { licenseNumber: expect.any(Array), specialty: expect.any(Array) } });
    expect(usersModule.acceptInvitation).not.toHaveBeenCalled();
  });

  it("al aceptar borra la cookie, activa la clínica nueva y redirige al inicio", async () => {
    usersModule.acceptInvitation.mockResolvedValue({
      status: "ACCEPTED",
      kind: "DOCTOR",
      tenantName: "Clínica",
      relationshipKind: "STAFF",
      relationshipId: "membership-9",
      assignedToDoctor: false,
    });

    expect(await redirectedTo(acceptInvitation(undefined, form(DOCTOR_FORM)))).toBe("/");
    expect(invitationCookie.clear).toHaveBeenCalled();
    expect(usersModule.selectActiveClinic).toHaveBeenCalledWith({
      token: "sesion-1",
      kind: "STAFF",
      relationshipId: "membership-9",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("si activar la clínica falla, redirige a elegir clínica", async () => {
    usersModule.acceptInvitation.mockResolvedValue({
      status: "ACCEPTED",
      kind: "DOCTOR",
      tenantName: "Clínica",
      relationshipKind: "STAFF",
      relationshipId: "membership-9",
      assignedToDoctor: false,
    });
    usersModule.selectActiveClinic.mockRejectedValue(new TypeError("falló"));

    expect(await redirectedTo(acceptInvitation(undefined, form(DOCTOR_FORM)))).toBe("/select-clinic");
    expect(invitationCookie.clear).toHaveBeenCalled();
  });

  it("si ya pertenecía, avisa y borra la cookie", async () => {
    usersModule.acceptInvitation.mockResolvedValue({ status: "ALREADY_MEMBER", tenantName: "Clínica del Sol" });

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toEqual({
      status: "already-member",
      message: "Ya pertenecés a Clínica del Sol.",
    });
    expect(invitationCookie.clear).toHaveBeenCalled();
  });

  it("con un dato incorrecto avisa cuántos intentos quedan y conserva la cookie", async () => {
    usersModule.acceptInvitation.mockResolvedValue({ status: "PROOF_MISMATCH", attemptsLeft: 3 });

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toEqual({
      status: "error",
      message: "Los datos no coinciden. Te quedan 3 intentos.",
    });
    expect(invitationCookie.clear).not.toHaveBeenCalled();
  });

  it("con el último intento fallido informa la invalidación y borra la cookie", async () => {
    usersModule.acceptInvitation.mockResolvedValue({ status: "PROOF_MISMATCH", attemptsLeft: 0 });

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toMatchObject({
      status: "finished",
      message: expect.stringContaining("demasiados intentos"),
    });
    expect(invitationCookie.clear).toHaveBeenCalled();
  });

  it("ante un conflicto explica el motivo y conserva la cookie", async () => {
    usersModule.acceptInvitation.mockResolvedValue({ status: "CONFLICT", reason: "ROLE_CHANGE_NOT_SUPPORTED" });

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toEqual({
      status: "error",
      message: "Sumar el rol de médico lo gestiona la clínica: pedíselo a un administrador.",
    });
    expect(invitationCookie.clear).not.toHaveBeenCalled();
  });

  it("con un link no válido muestra el mensaje genérico y borra la cookie", async () => {
    usersModule.acceptInvitation.mockResolvedValue({ status: "INVALID" });

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toEqual({
      status: "finished",
      message: "Esta invitación no es válida o venció.",
    });
    expect(invitationCookie.clear).toHaveBeenCalled();
  });

  it("un error inesperado se registra solo por su nombre", async () => {
    usersModule.acceptInvitation.mockRejectedValue(new TypeError(`falló con ${COOKIE_TOKEN} y MN123`));

    expect(await acceptInvitation(undefined, form(DOCTOR_FORM))).toEqual({
      status: "error",
      message: "No pudimos completar la vinculación. Probá de nuevo.",
    });
    const logged = vi.mocked(console.error).mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain(COOKIE_TOKEN);
    expect(logged).not.toContain("MN123");
  });
});
