import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudyNoAccess, WaveformUnavailable } from "@/app/(dashboard)/_studies/_components/viewer/viewer-states";

const back = { href: "/studies", label: "Volver a mis estudios" };

describe("estados del visor", () => {
  it("«Sin acceso» dice siempre lo mismo y vuelve a la lista", () => {
    const { container } = render(<StudyNoAccess back={back} />);

    expect(screen.getByText("No tenés acceso a este estudio.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver a mis estudios" }).getAttribute("href")).toBe("/studies");
    expect(container.textContent).not.toMatch(/estudio \d|studies\/|paciente/i);
  });

  it("«Onda no disponible» no da detalles internos y vuelve a la lista", () => {
    const { container } = render(<WaveformUnavailable back={back} />);

    expect(screen.getByRole("status").textContent).toBe(
      "La onda de este estudio no está disponible. Probá de nuevo más tarde o cargalo otra vez.",
    );
    expect(screen.getByRole("link", { name: "Volver a mis estudios" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/S3|bucket|clave|error/i);
  });
});
