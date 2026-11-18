import { render, screen, within } from "@testing-library/react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/(dashboard)/page";
import type { ReadyAccessContext } from "@/app/_lib/access";

const { requireClinicContext, getDoctorOverview } = vi.hoisted(() => ({
  requireClinicContext: vi.fn<() => Promise<ReadyAccessContext>>(),
  getDoctorOverview: vi.fn<typeof import("@/modules/studies/composition").getDoctorOverview>(),
}));

vi.mock("@/app/_lib/access", () => ({ requireClinicContext }));
vi.mock("@/modules/studies/composition", () => ({ getDoctorOverview }));

function doctorContext(isClinicAdmin: boolean): ReadyAccessContext {
  return {
    status: "ready",
    user: { id: "medico", email: "medico@example.test", fullName: "Médico de prueba", isPlatformAdmin: false },
    clinic: {
      tenantId: "clinica-activa",
      tenantName: "Clínica del Sol",
      relationship: { kind: "STAFF", membershipId: "membresia-medica", isClinicAdmin, isDoctor: true },
    },
  };
}

async function openHome() {
  const stream = await renderToReadableStream(<HomePage />);
  await stream.allReady;
  const htmlKey = "__html";
  render(<div dangerouslySetInnerHTML={{ [htmlKey]: await new Response(stream).text() }} />);
  expect(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeTruthy();
  expect(screen.getByText("Clínica del Sol")).toBeTruthy();
  return within(screen.getByRole("region", { name: "Resumen clínico" }));
}

beforeEach(() => {
  requireClinicContext.mockReset();
  getDoctorOverview.mockReset();
  requireClinicContext.mockResolvedValue(doctorContext(false));
});

describe("resumen de Inicio para el médico", () => {
  it("muestra totales completos y una lista de estudios con paciente, fecha y enlace contextual", async () => {
    getDoctorOverview.mockResolvedValue({
      assignedPatientCount: 2,
      studyCount: 7,
      recentStudies: Array.from({ length: 5 }, (value, index) => ({
        id: `estudio-${7 - index}`,
        number: 7 - index,
        patientName: "Ana Ejemplo",
        uploadedAt: new Date(Date.UTC(2026, 10, 18 - index, 15, 30)),
      })),
    });

    const overview = await openHome();

    expect(getDoctorOverview).toHaveBeenCalledExactlyOnceWith({
      actor: { kind: "DOCTOR", tenantId: "clinica-activa", membershipId: "membresia-medica", userId: "medico" },
    });
    expect(overview.getByText("Tus asignaciones vigentes en esta clínica.")).toBeTruthy();
    expect(overview.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]))
      .toEqual([["Pacientes asignados", "2"], ["Estudios de esos pacientes", "7"]]);
    const recent = within(overview.getByRole("region", { name: "Estudios recientes" }));
    const rows = recent.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText("Ana Ejemplo")).toBeTruthy();
    expect(within(rows[0]).getByText("Estudio 7")).toBeTruthy();
    const date = within(rows[0]).getByText(/^18\/11\/26, 12:30(?: p\. m\.)?$/);
    expect(date.getAttribute("datetime")).toBe("2026-11-18T15:30:00.000Z");
    expect(recent.getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual(["/studies/estudio-7", "/studies/estudio-6", "/studies/estudio-5", "/studies/estudio-4", "/studies/estudio-3"]);
    expect(within(rows[0]).getByRole("link", { name: "Ver estudio 7 de Ana Ejemplo" })).toBeTruthy();
    const secondary = overview.getByRole("link", { name: "Mis pacientes" });
    expect(secondary.getAttribute("href")).toBe("/patients");
    expect(overview.getAllByRole("link").at(-1)).toBe(secondary);
    expect(screen.queryByRole("heading", { name: "Pacientes de la clínica" })).toBeNull();
  });

  it.each([
    { isClinicAdmin: false, assignedPatientCount: 2, message: "Tus pacientes asignados todavía no tienen estudios cargados." },
    { isClinicAdmin: true, assignedPatientCount: 0, message: "Todavía no tenés pacientes asignados." },
  ])("conserva el resumen con $assignedPatientCount pacientes y ningún estudio", async (testCase) => {
    requireClinicContext.mockResolvedValue(doctorContext(testCase.isClinicAdmin));
    getDoctorOverview.mockResolvedValue({ assignedPatientCount: testCase.assignedPatientCount, studyCount: 0, recentStudies: [] });

    const overview = await openHome();

    expect(getDoctorOverview).toHaveBeenCalledExactlyOnceWith({
      actor: { kind: "DOCTOR", tenantId: "clinica-activa", membershipId: "membresia-medica", userId: "medico" },
    });
    expect(overview.getAllByRole("definition").map((value) => value.textContent)).toEqual([
      String(testCase.assignedPatientCount), "0",
    ]);
    const recent = within(overview.getByRole("region", { name: "Estudios recientes" }));
    expect(recent.getByText(testCase.message)).toBeTruthy();
    expect(recent.queryByRole("list")).toBeNull();
    expect(overview.getAllByRole("link")).toEqual([overview.getByRole("link", { name: "Mis pacientes" })]);
  });

  it("no presenta una falla de lectura como cifras reales ni imprime detalles internos", async () => {
    getDoctorOverview.mockRejectedValue(new Error("detalle interno de la consulta"));

    const overview = await openHome();

    expect(overview.getByRole("alert").textContent).toBe(
      "No pudimos cargar el resumen clínico. Probá de nuevo en unos minutos.",
    );
    expect(overview.queryByRole("definition")).toBeNull();
    expect(overview.queryByRole("list")).toBeNull();
    expect(overview.queryByText("detalle interno de la consulta")).toBeNull();
    expect(overview.getByRole("link", { name: "Mis pacientes" }).getAttribute("href")).toBe("/patients");
  });
});
