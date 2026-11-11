import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
const requestAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(dashboard)/_studies/_actions/request-analysis", () => ({ requestAnalysisAction: requestAction }));

import { AnalysisProgress } from "@/app/(dashboard)/_studies/_components/analysis/analysis-progress";
import { RequestAnalysisButton } from "@/app/(dashboard)/_studies/_components/analysis/request-analysis-button";
import { ANALYSIS_FAILURE_MESSAGES, ANALYSIS_MESSAGES } from "@/app/(dashboard)/_studies/_lib/analysis-messages";

describe("botón de pedir el análisis", () => {
  it("ofrece «Analizar estudio» con el identificador del estudio", () => {
    const { container } = render(<RequestAnalysisButton studyId="study-1" inProgress={false} />);

    expect((screen.getByRole("button", { name: ANALYSIS_MESSAGES.requestButton }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((container.querySelector("input[name=studyId]") as HTMLInputElement).value).toBe("study-1");
  });

  it("con uno en curso queda deshabilitado y lo dice", () => {
    render(<RequestAnalysisButton studyId="study-1" inProgress />);

    const button = screen.getByRole("button", { name: ANALYSIS_MESSAGES.requestInProgress }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: ANALYSIS_MESSAGES.requestButton })).toBeNull();
  });

  it("el área táctil es de al menos 44 px", () => {
    render(<RequestAnalysisButton studyId="study-1" inProgress={false} />);

    expect(screen.getByRole("button").className).toContain("min-h-11");
  });
});

describe("progreso del análisis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  function setVisibility(value: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { value, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("anuncia el progreso y actualiza la pantalla cada 3 segundos", () => {
    render(<AnalysisProgress />);

    expect(screen.getByText(ANALYSIS_MESSAGES.progress)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("se detiene con la pestaña oculta y retoma al volver", () => {
    render(<AnalysisProgress />);

    act(() => setVisibility("hidden"));
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(refresh).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("limpia el intervalo al desmontarse", () => {
    const { unmount } = render(<AnalysisProgress />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(9000);
    });

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("textos de falla", () => {
  it("hay un motivo genérico para cada código, sin detalles internos", () => {
    const text = Object.values(ANALYSIS_FAILURE_MESSAGES).join(" ").toLowerCase();

    expect(Object.keys(ANALYSIS_FAILURE_MESSAGES)).toHaveLength(5);
    expect(text).not.toMatch(/sagemaker|endpoint|aws|stack|exception|424/);
  });
});
