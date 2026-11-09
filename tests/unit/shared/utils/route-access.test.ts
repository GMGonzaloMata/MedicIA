import { describe, expect, it } from "vitest";

import { buildSignInRedirectPath, isProtectedPath } from "@/shared/utils/route-access";

describe("isProtectedPath", () => {
  it.each(["/sign-in", "/sign-up", "/verify-email", "/forgot-password", "/reset-password"])(
    "la pantalla de acceso %s es pública",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
      expect(isProtectedPath(`${pathname}/`)).toBe(false);
    },
  );

  it.each(["/", "/select-clinic", "/no-access", "/studies", "/studies/123/results"])(
    "la ruta %s es protegida",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(true);
    },
  );

  it("no confunde una ruta que solo empieza igual con una pública", () => {
    expect(isProtectedPath("/sign-in-evil")).toBe(true);
    expect(isProtectedPath("/sign-up.json")).toBe(true);
  });
});

describe("buildSignInRedirectPath", () => {
  it("lleva la ruta original, con su consulta, codificada en next", () => {
    expect(buildSignInRedirectPath("/studies", "?tab=results&page=2")).toBe(
      "/sign-in?next=%2Fstudies%3Ftab%3Dresults%26page%3D2",
    );
  });

  it("lleva la raíz sin consulta", () => {
    expect(buildSignInRedirectPath("/", "")).toBe("/sign-in?next=%2F");
  });

  it("reemplaza por la raíz una ruta que no es interna", () => {
    expect(buildSignInRedirectPath("//example.com", "")).toBe("/sign-in?next=%2F");
    expect(buildSignInRedirectPath("/\\example.com", "")).toBe("/sign-in?next=%2F");
  });

  it("devuelve un valor que, decodificado, es una ruta segura", () => {
    const url = new URL(buildSignInRedirectPath("/studies/1", "?a=b"), "http://localhost");

    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("next")).toBe("/studies/1?a=b");
  });
});
