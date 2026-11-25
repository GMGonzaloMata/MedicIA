import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AttendingDoctorNotice } from "@/app/(dashboard)/_studies/_components/attending-doctor-notice";
import { STUDY_MESSAGES } from "@/app/(dashboard)/_studies/_lib/study-messages";

const tenantsModule = vi.hoisted(() => ({ getAttendingDoctorAvailability: vi.fn() }));

const getTenantsModule = vi.hoisted(() => vi.fn());

vi.mock("@/modules/tenants/composition", () => ({ getTenantsModule }));

async function renderNotice() {
  const stream = await renderToReadableStream(<AttendingDoctorNotice tenantId="tenant-1" patientId="patient-1" />);
  await stream.allReady;
  const html = await new Response(stream).text();
  const htmlKey = "__html";
  render(<div dangerouslySetInnerHTML={{ [htmlKey]: html }} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantsModule.mockReturnValue(tenantsModule);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("aviso de médico no disponible", () => {
  it("se muestra solo cuando todos los médicos asignados están desactivados", async () => {
    tenantsModule.getAttendingDoctorAvailability.mockResolvedValue("UNAVAILABLE");

    await renderNotice();

    expect(screen.getByRole("status").textContent).toBe(STUDY_MESSAGES.doctorUnavailable);
    expect(STUDY_MESSAGES.doctorUnavailable).toContain("Tu médico ya no está disponible");
  });

  it.each(["AVAILABLE", "NO_ASSIGNMENT"])("no se muestra con %s", async (availability) => {
    tenantsModule.getAttendingDoctorAvailability.mockResolvedValue(availability);

    await renderNotice();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si la consulta falla, no se muestra nada y la pantalla no se rompe", async () => {
    tenantsModule.getAttendingDoctorAvailability.mockRejectedValue(new Error("falla"));

    await renderNotice();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si armar el módulo falla (por ejemplo, falta configuración), la pantalla no se rompe y se registra solo el nombre", async () => {
    getTenantsModule.mockImplementation(() => {
      throw new TypeError("APP_BASE_URL con datos@personales.com");
    });

    await renderNotice();

    expect(screen.queryByRole("status")).toBeNull();
    expect(console.error).toHaveBeenCalledWith("[estudios] no se pudo consultar la disponibilidad del médico: TypeError");
  });

  it("consulta con la clínica y el paciente que recibe del contexto, y no muestra datos del médico", async () => {
    tenantsModule.getAttendingDoctorAvailability.mockResolvedValue("UNAVAILABLE");

    await renderNotice();

    expect(tenantsModule.getAttendingDoctorAvailability).toHaveBeenCalledWith({ tenantId: "tenant-1", patientId: "patient-1" });
    expect(document.body.textContent).not.toMatch(/Dr\.|Dra\.|@/);
  });

  it("la pantalla de estudios le pasa el actor del contexto, nunca datos del cliente", () => {
    const source = readFileSync("src/app/(dashboard)/studies/page.tsx", "utf8");

    expect(source).toContain("<AttendingDoctorNotice tenantId={actor.tenantId} patientId={actor.patientId} />");
    expect(source).not.toMatch(/searchParams[^;]*(tenantId|patientId)/);
  });
});
