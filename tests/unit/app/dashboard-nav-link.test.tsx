import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardNavLink } from "@/app/(dashboard)/_components/dashboard-nav-link";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn<() => string>() }));
vi.mock("next/navigation", () => ({ usePathname }));

beforeEach(() => usePathname.mockReturnValue("/patients/test-patient"));

describe("enlace de navegación", () => {
  it.each([
    ["/patients", "page"],
    ["/patients/test-patient", "page"],
    ["/patients/test-patient/studies", "page"],
    ["/patients-other", null],
    ["/patients2", null],
  ])("respeta el límite de segmento médico: %s", (pathname, expected) => {
    usePathname.mockReturnValue(pathname);
    render(<DashboardNavLink href="/patients">Mis pacientes</DashboardNavLink>);
    expect(screen.getByRole("link").getAttribute("aria-current")).toBe(expected);
  });

  it("actualiza el estado al navegar sin cambiar el destino ni los atributos del enlace", () => {
    const onClick = vi.fn<React.MouseEventHandler<HTMLAnchorElement>>((event) => event.preventDefault());
    const link = (
      <DashboardNavLink
        href="/patients"
        className="dashboard-nav-link extra"
        title="Lista de pacientes"
        target="_blank"
        rel="noreferrer"
        prefetch={false}
        replace
        scroll={false}
        onClick={onClick}
      >
        Mis pacientes
      </DashboardNavLink>
    );
    const { rerender } = render(link);
    const anchor = screen.getByRole("link", { name: "Mis pacientes" });
    expect(anchor.getAttribute("href")).toBe("/patients");
    expect(anchor.className).toBe("dashboard-nav-link extra");
    expect(anchor.getAttribute("title")).toBe("Lista de pacientes");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noreferrer");
    expect(anchor.getAttribute("aria-current")).toBe("page");
    fireEvent.click(anchor);
    expect(onClick).toHaveBeenCalledTimes(1);

    usePathname.mockReturnValue("/studies");
    rerender(<DashboardNavLink {...link.props} />);
    expect(anchor.hasAttribute("aria-current")).toBe(false);
    expect(anchor.getAttribute("href")).toBe("/patients");
  });
});

describe("estilo actual de navegación", () => {
  it("vincula el indicador a aria-current con tokens y una señal no cromática", () => {
    const css = readFileSync("src/app/(dashboard)/dashboard.css", "utf8");
    const rule = css.match(/\.clinical-nav-link\[aria-current="page"\]\s*\{([^}]+)\}/)?.[1];
    expect(rule).toContain("var(--clinical-selected)");
    expect(rule).toContain("font-weight: 650");
    expect(css).toMatch(/\.clinical-nav-link\[aria-current="page"\]::before\s*\{[^}]+border-inline-start:/);
    expect(css).toMatch(/\.clinical-shell [^\n]+:focus-visible\s*\{[^}]+outline: 2px solid var\(--clinical-focus\)/);
  });
});
