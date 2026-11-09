import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/shared/constants/session-cookie";

const ORIGIN = "http://localhost:3000";

function requestTo(path: string, { withSessionCookie = false } = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: withSessionCookie ? { cookie: `${SESSION_COOKIE_NAME}=cualquier-valor` } : {},
  });
}

describe("proxy", () => {
  it("lleva a la pantalla de ingreso, con el destino, a quien no tiene cookie en una ruta protegida", () => {
    const response = proxy(requestTo("/studies?tab=results"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fstudies%3Ftab%3Dresults`);
  });

  it("deja pasar una ruta protegida si hay cookie de sesión, sin validarla", () => {
    const response = proxy(requestTo("/studies", { withSessionCookie: true }));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/sign-in", "/sign-up", "/verify-email", "/forgot-password", "/reset-password"])(
    "deja pasar la pantalla pública %s sin cookie",
    (path) => {
      const response = proxy(requestTo(path));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("no deja pasar con un ingreso externo como destino", () => {
    const response = proxy(requestTo("//example.com/ruta"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2F`);
  });
});
