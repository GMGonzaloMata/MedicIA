import { describe, expect, it } from "vitest";

import {
  AnalysisInProgressError,
  AnalysisNotFoundError,
  isAnalysisInProgressError,
  isAnalysisNotFoundError,
} from "@/modules/analyses/domain/analysis-errors";
import {
  StudyForbiddenError,
  StudyInUseError,
  StudyNotFoundError,
  isStudyAccessError,
} from "@/modules/studies/domain/study-errors";

describe("reconocer errores por su nombre", () => {
  it("reconoce los errores de análisis aunque vengan de otra copia del módulo", () => {
    const foreign = Object.assign(new Error("copia"), { name: "AnalysisNotFoundError" });

    expect(isAnalysisNotFoundError(new AnalysisNotFoundError())).toBe(true);
    expect(isAnalysisNotFoundError(foreign)).toBe(true);
    expect(isAnalysisInProgressError(new AnalysisInProgressError())).toBe(true);
    expect(isAnalysisInProgressError(new AnalysisNotFoundError())).toBe(false);
    expect(isAnalysisNotFoundError("texto")).toBe(false);
    expect(isAnalysisNotFoundError(null)).toBe(false);
  });

  it("reconoce el estudio ajeno o inexistente, y solo eso", () => {
    const foreign = Object.assign(new Error("copia"), { name: "StudyForbiddenError" });

    expect(isStudyAccessError(new StudyForbiddenError())).toBe(true);
    expect(isStudyAccessError(new StudyNotFoundError())).toBe(true);
    expect(isStudyAccessError(foreign)).toBe(true);
    expect(isStudyAccessError(new StudyInUseError())).toBe(false);
    expect(isStudyAccessError(undefined)).toBe(false);
  });
});
