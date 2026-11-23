import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicHeader } from "@/app/(dashboard)/_components/clinic-header";
import HomePage from "@/app/(dashboard)/page";
import type { ReadyAccessContext } from "@/app/_lib/access";
import type { AccessContext, ClinicRelationship } from "@/modules/users/domain/access-context";

const { getAccessContext, requireClinicContext, usePathname, getDoctorOverview } = vi.hoisted(() => ({
  getAccessContext: vi.fn<() => Promise<AccessContext>>(),
  requireClinicContext: vi.fn<() => Promise<ReadyAccessContext>>(),
  usePathname: vi.fn<() => string>(),
  getDoctorOverview: vi.fn(),
}));

vi.mock("@/app/_lib/access", () => ({ getAccessContext, requireClinicContext }));
vi.mock("@/modules/studies/composition", () => ({ getDoctorOverview }));
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("@/app/(dashboard)/_components/sign-out-button", () => Object.fromEntries([
  ["SignOutButton", () => <button>Salir</button>],
]));

function readyContext(relationship: ClinicRelationship): ReadyAccessContext {
  return {
    status: "ready",
    user: { id: "test-user", email: "user@example.test", fullName: "Usuario de prueba", isPlatformAdmin: false },
    clinic: { tenantId: "test-clinic", tenantName: "Clínica de prueba", relationship },
  };
}

async function renderServerView(view: ReactNode) {
  // Render público del servidor con acceso simulado: no se importa auth ni persistencia real.
  const stream = await renderToReadableStream(view);
  await stream.allReady;
  const html = await new Response(stream).text();
  const htmlKey = "__html";
  render(<div dangerouslySetInnerHTML={{ [htmlKey]: html }} />);
}

function renderHeader() {
  return renderServerView(<ClinicHeader />);
}

beforeEach(() => {
  vi.clearAllMocks();
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
      links: [["Inicio", "/"], ["Mis pacientes", "/patients"], ["Personal", "/clinic/staff"], ["Pacientes de la clínica", "/clinic/patients"], ["Cambiar de clínica", "/select-clinic"]],
      label: "Administrador de la clínica y médico",
    },
    {
      relationship: { kind: "STAFF", membershipId: "test-member", isClinicAdmin: true, isDoctor: false },
      links: [["Inicio", "/"], ["Personal", "/clinic/staff"], ["Pacientes de la clínica", "/clinic/patients"], ["Cambiar de clínica", "/select-clinic"]],
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
    expect(screen.getByRole("button", { name: "Salir" })).toBeTruthy();
  });
});

describe("Inicio para vínculos no médicos", () => {
  it.each<{ relationship: ClinicRelationship; title: string; destinations: [string, string][] }>([
    {
      relationship: { kind: "PATIENT", patientId: "test-patient" },
      title: "Estudios clínicos",
      destinations: [["Mis estudios", "/studies"]],
    },
    {
      relationship: { kind: "STAFF", membershipId: "test-member", isClinicAdmin: true, isDoctor: false },
      title: "Perfil administrativo",
      destinations: [["Personal de la clínica", "/clinic/staff"], ["Pacientes de la clínica", "/clinic/patients"]],
    },
  ])("organiza el acceso como $title", async ({ relationship, title, destinations }) => {
    requireClinicContext.mockResolvedValue(readyContext(relationship));
    await renderServerView(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Inicio" })).toBeTruthy();
    expect(screen.getByText("Clínica de prueba")).toBeTruthy();
    expect(screen.queryByText("Contexto de trabajo")).toBeNull();
    expect(screen.queryByRole("region", { name: "Resumen clínico" })).toBeNull();
    expect(getDoctorOverview).not.toHaveBeenCalled();
    const area = within(screen.getByRole("region", { name: title }));
    expect(area.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    for (const [label, href] of destinations) {
      expect(area.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
    expect(screen.getAllByRole("link")).toHaveLength(destinations.length);
  });
});
