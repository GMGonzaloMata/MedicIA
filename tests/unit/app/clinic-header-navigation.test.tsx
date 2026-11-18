import { render, screen, within } from "@testing-library/react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicHeader } from "@/app/(dashboard)/_components/clinic-header";
import type { AccessContext, ClinicRelationship } from "@/modules/users/domain/access-context";

const { getAccessContext, usePathname } = vi.hoisted(() => ({
  getAccessContext: vi.fn<() => Promise<AccessContext>>(),
  usePathname: vi.fn<() => string>(),
}));

vi.mock("@/app/_lib/access", () => ({ getAccessContext }));
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("@/app/(dashboard)/_components/sign-out-button", () => Object.fromEntries([
  ["SignOutButton", () => <button>Salir</button>],
]));

function readyContext(relationship: ClinicRelationship): AccessContext {
  return {
    status: "ready",
    user: { id: "test-user", email: "user@example.test", fullName: "Usuario de prueba", isPlatformAdmin: false },
    clinic: { tenantId: "test-clinic", tenantName: "Clínica de prueba", relationship },
  };
}

async function renderHeader() {
  // Render público del servidor con acceso simulado: no se importa auth ni persistencia real.
  const stream = await renderToReadableStream(<ClinicHeader />);
  await stream.allReady;
  const html = await new Response(stream).text();
  const htmlKey = "__html";
  render(<div dangerouslySetInnerHTML={{ [htmlKey]: html }} />);
}

beforeEach(() => {
  usePathname.mockReturnValue("/");
  getAccessContext.mockResolvedValue(readyContext({ kind: "PATIENT", patientId: "test-patient" }));
});

describe("estado actual de la navegación del encabezado", () => {
  it.each([
    ["/", "Inicio"],
    ["/studies", "Mis estudios"],
    ["/studies/test-study", "Mis estudios"],
    ["/studies/test-study/analysis", "Mis estudios"],
    ["/studies-old", null],
    ["/studies2", null],
    ["/select-clinic", "Cambiar de clínica"],
    ["/select-clinic/details", "Cambiar de clínica"],
    ["/select-clinic-old", null],
    ["/unrelated", null],
  ])("marca solo el enlace de %s", async (pathname, currentLabel) => {
    usePathname.mockReturnValue(pathname);
    await renderHeader();

    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    const links = within(nav).getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("aria-current")).toBe(
        link.textContent === currentLabel ? "page" : null,
      );
    }
    expect(links.filter((link) => link.hasAttribute("aria-current"))).toHaveLength(currentLabel ? 1 : 0);
  });
});

describe("visibilidad y destinos conservados por vínculo", () => {
  it.each<{ relationship: ClinicRelationship; links: [string, string][]; label: string }>([
    {
      relationship: { kind: "PATIENT", patientId: "test-patient" },
      links: [["Inicio", "/"], ["Mis estudios", "/studies"], ["Cambiar de clínica", "/select-clinic"]],
      label: "Paciente",
    },
    {
      relationship: { kind: "STAFF", membershipId: "test-member", isClinicAdmin: false, isDoctor: true },
      links: [["Inicio", "/"], ["Mis pacientes", "/patients"], ["Cambiar de clínica", "/select-clinic"]],
      label: "Médico",
    },
    {
      relationship: { kind: "STAFF", membershipId: "test-member", isClinicAdmin: true, isDoctor: true },
      links: [["Inicio", "/"], ["Mis pacientes", "/patients"], ["Cambiar de clínica", "/select-clinic"]],
      label: "Administrador de la clínica y médico",
    },
    {
      relationship: { kind: "STAFF", membershipId: "test-member", isClinicAdmin: true, isDoctor: false },
      links: [["Inicio", "/"], ["Cambiar de clínica", "/select-clinic"]],
      label: "Administrador de la clínica",
    },
  ])("conserva los enlaces de $label", async ({ relationship, links, label }) => {
    getAccessContext.mockResolvedValue(readyContext(relationship));
    await renderHeader();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(links);
    expect(screen.getByText("Clínica de prueba")).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salir" })).toBeTruthy();
    expect(getAccessContext).toHaveBeenCalledTimes(1);
  });

  it.each<AccessContext>([
    { status: "anonymous" },
    { status: "no-clinic", user: { id: "test-user", email: "user@example.test", fullName: "Usuario de prueba", isPlatformAdmin: false } },
  ])("no muestra navegación sin clínica: $status", async (context) => {
    getAccessContext.mockResolvedValue(context);
    await renderHeader();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
