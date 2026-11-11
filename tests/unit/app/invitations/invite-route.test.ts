import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateInvitationToken } from "@/modules/users/domain/invitation-token";

const setInvitationCookie = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/invitation-cookie", () => ({ setInvitationCookie }));

import { GET } from "@/app/invite/[token]/route";

const ORIGIN = "http://localhost:3000";

function call(token: string) {
  return GET(new NextRequest(`${ORIGIN}/invite/${token}`), { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ruta pública del link de la invitación", () => {
  it("con un token bien formado guarda la cookie y redirige a la pantalla de aceptar", async () => {
    const token = generateInvitationToken();

    const response = await call(token);

    expect(setInvitationCookie).toHaveBeenCalledWith(token);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/invitation`);
  });

  it("con un token inventado no guarda nada y responde igual", async () => {
    const valid = await call(generateInvitationToken());
    setInvitationCookie.mockClear();

    const invented = await call("no-es-un-token");

    expect(setInvitationCookie).not.toHaveBeenCalled();
    expect(invented.status).toBe(valid.status);
    expect(invented.headers.get("location")).toBe(valid.headers.get("location"));
    expect(invented.headers.get("referrer-policy")).toBe(valid.headers.get("referrer-policy"));
    expect(invented.headers.get("cache-control")).toBe(valid.headers.get("cache-control"));
  });

  it("no filtra el token por el encabezado de referencia ni queda en cachés", async () => {
    const response = await call(generateInvitationToken());

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
