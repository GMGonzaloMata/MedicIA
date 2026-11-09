import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "@/shared/utils/safe-redirect";

describe("getSafeRedirectPath", () => {
  it("acepta rutas internas, con consulta y anidadas", () => {
    expect(getSafeRedirectPath("/")).toBe("/");
    expect(getSafeRedirectPath("/select-clinic")).toBe("/select-clinic");
    expect(getSafeRedirectPath("/studies/123?tab=results")).toBe("/studies/123?tab=results");
  });

  it.each([
    { description: "una dirección con esquema", value: "https://example.com" },
    { description: "un esquema sin barras", value: "javascript:alert(1)" },
    { description: "una ruta relativa", value: "studies" },
    { description: "una dirección sin esquema", value: "//example.com" },
    { description: "una barra invertida inicial", value: "/\\example.com" },
    { description: "una barra invertida en medio", value: "/studies\\..\\example" },
    { description: "una doble barra codificada", value: "/%2Fexample.com" },
    { description: "una barra invertida codificada", value: "/%5Cexample.com" },
    { description: "un salto de línea", value: "/studies\nSet-Cookie: a=b" },
    { description: "un salto de línea codificado", value: "/studies%0d%0aSet-Cookie" },
    { description: "un carácter de control", value: "/studies\u0007" },
    { description: "una codificación inválida", value: "/%E0%A4%A" },
    { description: "una cadena vacía", value: "" },
  ])("reemplaza por la raíz $description", ({ value }) => {
    expect(getSafeRedirectPath(value)).toBe("/");
  });

  it("reemplaza por la raíz lo que no es texto", () => {
    expect(getSafeRedirectPath(undefined)).toBe("/");
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath(42)).toBe("/");
    expect(getSafeRedirectPath(["/studies"])).toBe("/");
  });
});
