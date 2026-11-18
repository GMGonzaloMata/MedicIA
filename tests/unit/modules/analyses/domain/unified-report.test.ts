import { describe, expect, it } from "vitest";

import { ANALYSIS_FAILURE_CODES, ANALYSIS_STATUSES, type AnalysisStatus } from "@/modules/analyses/domain/analysis";
import { FINDING_KEYS, orderProbabilities, parseProbabilities } from "@/modules/analyses/domain/findings";
import {
  createUnifiedReport,
  InvalidUnifiedReportError,
  parseUnifiedReport,
  publishUnifiedReport,
} from "@/modules/analyses/domain/unified-report";

const REQUESTED_AT = "2026-11-16T10:00:00.000Z";
const STARTED_AT = "2026-11-16T10:00:01.000Z";
const FINISHED_AT = "2026-11-16T10:00:02.000Z";
const AVAILABLE = { status: "AVAILABLE" };
const NOT_AVAILABLE = { status: "NOT_AVAILABLE", reason: "Artefactos pendientes." };
const ERROR_MESSAGE = "El informe integrado no tiene la forma esperada.";

function probabilities() {
  return parseProbabilities(Object.fromEntries(FINDING_KEYS.map((key, index) => [key, index / 11])));
}

function request() {
  return {
    analysisId: "request-1",
    studyId: "study-1",
    requestedByUserId: "requester-1",
    requestedAt: REQUESTED_AT,
    capabilities: { echonext: { ...NOT_AVAILABLE }, e022: { ...AVAILABLE } },
  };
}

function execution(component: "echonext" | "e022", status: AnalysisStatus) {
  return {
    analysisId: "request-1",
    status,
    startedAt: status === "PENDING" ? null : STARTED_AT,
    finishedAt: status === "COMPLETED" || status === "FAILED" ? FINISHED_AT : null,
    failureCode: status === "FAILED" ? "TIMEOUT" : null,
    modelName: status === "COMPLETED" ? `synthetic-${component}` : null,
    modelVersion: status === "COMPLETED" ? "synthetic-v1" : null,
    preprocessingReference: status === "COMPLETED" ? `synthetic-preparation-${component}` : null,
    result: status !== "COMPLETED" ? null : component === "echonext"
      ? probabilities()
      : { target: "lvef_lte_45", score: 0.72 },
  };
}

function document(echonextStatus?: AnalysisStatus, e022Status: AnalysisStatus = "PENDING") {
  return {
    ...request(),
    schemaVersion: "ecg-unified.v1",
    capabilities: {
      echonext: echonextStatus ? { ...AVAILABLE } : { ...NOT_AVAILABLE },
      e022: { ...AVAILABLE },
    },
    components: {
      ...(echonextStatus ? { echonext: execution("echonext", echonextStatus) } : {}),
      e022: execution("e022", e022Status),
    },
  };
}

function expectRejected(value: unknown) {
  // El rechazo no muta la entrada ni revela su contenido; no hay almacenamiento ni contadores en esta unidad.
  const before = structuredClone(value);
  expect(() => parseUnifiedReport(value)).toThrow(InvalidUnifiedReportError);
  expect(() => parseUnifiedReport(value)).toThrow(ERROR_MESSAGE);
  expect(() => publishUnifiedReport(value)).toThrow(ERROR_MESSAGE);
  expect(value).toEqual(before);
}

describe("snapshot y pedido integrado", () => {
  it("crea solo E022 PENDING y conserva la omisión Mini sin ejecución, error, versión o resultado", () => {
    const input = request();
    const report = createUnifiedReport(input);
    expect(report).toEqual(document());
    expect(report.components).not.toHaveProperty("echonext");
    expect(report.capabilities.echonext).toEqual(NOT_AVAILABLE);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.capabilities)).toBe(true);
    expect(Object.isFrozen(report.capabilities.echonext)).toBe(true);
    expect(Object.isFrozen(report.components)).toBe(true);
    expect(Object.isFrozen(report.components.e022)).toBe(true);
    input.capabilities.echonext.status = "AVAILABLE";
    input.capabilities.echonext.reason = "Cambio posterior.";
    expect(report.capabilities.echonext).toEqual(NOT_AVAILABLE);
    expect(() => Object.assign(report.capabilities.echonext, AVAILABLE)).toThrow(TypeError);
    expect(publishUnifiedReport(report).coverage).toBe("WAITING");
  });

  it("crea ambas ejecuciones solo si ambas capacidades estaban disponibles", () => {
    const input = { ...request(), capabilities: { echonext: AVAILABLE, e022: AVAILABLE } };
    expect(createUnifiedReport(input)).toEqual(document("PENDING"));
  });

  it("admite solo EchoNext sin fabricar una ejecución E022", () => {
    const input = { ...request(), capabilities: { echonext: AVAILABLE, e022: NOT_AVAILABLE } };
    const report = createUnifiedReport(input);
    expect(Object.keys(report.components)).toEqual(["echonext"]);
    const finished = { ...report, components: { echonext: execution("echonext", "COMPLETED") } };
    expect(publishUnifiedReport(finished).coverage).toBe("PARTIAL");
  });

  it("rechaza el pedido vacío sin mutarlo", () => {
    const input = { ...request(), capabilities: { echonext: NOT_AVAILABLE, e022: NOT_AVAILABLE } };
    const before = structuredClone(input);
    expect(() => createUnifiedReport(input)).toThrow(ERROR_MESSAGE);
    expect(input).toEqual(before);
    expectRejected({ ...document(), capabilities: input.capabilities, components: {} });
  });

  it("rechaza campos externos no permitidos también al crear", () => {
    expect(() => createUnifiedReport({ ...request(), endpoint: "untrusted" })).toThrow(ERROR_MESSAGE);
    expect(() => createUnifiedReport(null)).toThrow(ERROR_MESSAGE);
  });
});

describe("publicación sin fusión ni exposición temprana", () => {
  it.each(ANALYSIS_STATUSES)("solo E022 %s: WAITING/PARTIAL/NONE sin esperar Mini", (status) => {
    const input = document(undefined, status);
    const before = structuredClone(input);
    const publication = publishUnifiedReport(input);
    const expected = status === "COMPLETED" ? "PARTIAL" : status === "FAILED" ? "NONE" : "WAITING";
    expect(publication.coverage).toBe(expected);
    expect(publication.components).toEqual({ e022: {
      status, startedAt: input.components.e022.startedAt,
      finishedAt: input.components.e022.finishedAt, failureCode: input.components.e022.failureCode,
    } });
    expect(publication.capabilities.echonext).toEqual(NOT_AVAILABLE);
    expect(publication.components).not.toHaveProperty("echonext");
    if (publication.coverage === "PARTIAL" || publication.coverage === "COMPLETE") {
      expect(publication.contributions).toEqual([{ component: "e022", execution: input.components.e022 }]);
    } else {
      expect(publication).not.toHaveProperty("contributions");
      expect(JSON.stringify(publication)).not.toMatch(/result|score|modelVersion|modelName|lvef/);
    }
    expect(input).toEqual(before);
  });

  for (const echoNextStatus of ANALYSIS_STATUSES) {
    it.each(ANALYSIS_STATUSES)(`ambos: ${echoNextStatus}/%s espera todos los terminales`, (e022Status) => {
      const input = document(echoNextStatus, e022Status);
      const publication = publishUnifiedReport(input);
      const waiting = [echoNextStatus, e022Status].some((status) => status === "PENDING" || status === "PROCESSING");
      const successes = [echoNextStatus, e022Status].filter((status) => status === "COMPLETED").length;
      expect(publication.coverage).toBe(waiting ? "WAITING" : successes === 2 ? "COMPLETE" : successes === 1 ? "PARTIAL" : "NONE");
      if (publication.coverage === "COMPLETE" || publication.coverage === "PARTIAL") {
        expect(publication.contributions).toEqual([
          ...(echoNextStatus === "COMPLETED" ? [{ component: "echonext", execution: input.components.echonext }] : []),
          ...(e022Status === "COMPLETED" ? [{ component: "e022", execution: input.components.e022 }] : []),
        ]);
      } else {
        expect(publication).not.toHaveProperty("contributions");
        expect(JSON.stringify(publication)).not.toMatch(/result|score|modelVersion|modelName|lvef/);
      }
    });
  }

  it("preserva 12+1 indicadores, shd, procedencias y estructura igual sin score agregado", () => {
    const input = document("COMPLETED", "COMPLETED");
    const publication = publishUnifiedReport(input);
    expect(Object.keys(publication)).toEqual([
      "analysisId", "studyId", "requestedAt", "capabilities", "components", "coverage", "contributions",
    ]);
    if (publication.coverage !== "COMPLETE") throw new Error("Expected COMPLETE");
    expect(publication.contributions).toHaveLength(2);
    expect(publication.contributions.map((item) => Object.keys(item))).toEqual([
      ["component", "execution"], ["component", "execution"],
    ]);
    for (const contribution of publication.contributions) {
      expect(contribution.execution).toMatchObject({
        analysisId: "request-1", modelName: `synthetic-${contribution.component}`,
        modelVersion: "synthetic-v1", preprocessingReference: `synthetic-preparation-${contribution.component}`,
        startedAt: STARTED_AT, finishedAt: FINISHED_AT,
      });
      expect(Object.isFrozen(contribution.execution.result)).toBe(true);
      expect(Object.isFrozen(contribution)).toBe(true);
    }
    expect(Object.isFrozen(publication.contributions)).toBe(true);
    expect(Object.isFrozen(publication)).toBe(true);
    expect(publication.contributions[0]?.execution.result).toEqual(probabilities());
    expect(publication.contributions[1]?.execution.result).toEqual({ target: "lvef_lte_45", score: 0.72 });
    // PRESERVE: el contrato legacy mantiene orden, extremos y compuesto propios.
    expect(orderProbabilities(probabilities())).toEqual(FINDING_KEYS.map((key, index) => ({ key, value: index / 11 })));
  });

  it("mantiene el informe previo al crear otro pedido y rechaza contribuciones ajenas", () => {
    const previous = parseUnifiedReport(document("COMPLETED", "COMPLETED"));
    const before = publishUnifiedReport(previous);
    const next = createUnifiedReport({ ...request(), analysisId: "request-2", requestedAt: FINISHED_AT });
    expect(next.components.e022?.analysisId).toBe("request-2");
    expect(publishUnifiedReport(next).coverage).toBe("WAITING");
    expect(publishUnifiedReport(previous)).toEqual(before);
    const mixed = { ...next, components: { e022: previous.components.e022 } };
    expectRejected(mixed);
  });
});

describe("validación estricta del documento externo", () => {
  it.each([null, [], {}, "clinical-private-value", 1])("rechaza forma externa %j con error fijo", (value) => {
    expectRejected(value);
  });

  it.each([
    { schemaVersion: "ecg-unified.v2" },
    { analysisId: " " }, { studyId: "" }, { requestedByUserId: null },
    { requestedAt: "2026-02-30T10:00:00.000Z" }, { requestedAt: "invalid" },
    { extra: "clinical-private-value" },
    { capabilities: { e022: AVAILABLE } },
    { capabilities: { echonext: NOT_AVAILABLE, e022: AVAILABLE, extra: AVAILABLE } },
    { capabilities: { echonext: { status: "NOT_AVAILABLE", reason: " " }, e022: AVAILABLE } },
    { capabilities: { echonext: { ...NOT_AVAILABLE, failureCode: "INTERNAL" }, e022: AVAILABLE } },
    { capabilities: { echonext: { status: "UNKNOWN" }, e022: AVAILABLE } },
    { components: {} },
    { components: { echonext: execution("echonext", "PENDING"), e022: execution("e022", "PENDING") } },
    { components: { e022: execution("e022", "PENDING"), extra: execution("e022", "PENDING") } },
  ])("rechaza contrato/capacidades/componentes inválidos %#", (override) => {
    expectRejected({ ...document(), ...override });
  });

  it("rechaza una clave de ejecución omitida aunque su valor sea undefined", () => {
    expectRejected({ ...document(), components: { echonext: undefined, e022: execution("e022", "PENDING") } });
  });

  it.each(["schemaVersion", "analysisId", "studyId", "requestedByUserId", "requestedAt", "capabilities", "components"])(
    "rechaza campo obligatorio ausente: %s", (key) => {
      const input: Record<string, unknown> = { ...document() };
      delete input[key];
      expectRejected(input);
    },
  );

  it.each(ANALYSIS_STATUSES)("rechaza cada campo de ejecución ausente en %s", (status) => {
    for (const key of Object.keys(execution("e022", status))) {
      const component: Record<string, unknown> = { ...execution("e022", status) };
      delete component[key];
      expectRejected({ ...document(), components: { e022: component } });
    }
  });

  const invalidFields: { status: AnalysisStatus; override: Record<string, unknown> }[] = [
    { status: "PENDING", override: { startedAt: STARTED_AT } },
    { status: "PENDING", override: { finishedAt: FINISHED_AT } },
    { status: "PENDING", override: { failureCode: "INTERNAL" } },
    { status: "PENDING", override: { result: { target: "lvef_lte_45", score: 0.3 } } },
    { status: "PROCESSING", override: { startedAt: null } },
    { status: "PROCESSING", override: { finishedAt: FINISHED_AT } },
    { status: "PROCESSING", override: { failureCode: "INTERNAL" } },
    { status: "PROCESSING", override: { result: { target: "lvef_lte_45", score: 0.3 } } },
    { status: "COMPLETED", override: { startedAt: null } },
    { status: "COMPLETED", override: { finishedAt: null } },
    { status: "COMPLETED", override: { modelName: " " } },
    { status: "COMPLETED", override: { modelVersion: null } },
    { status: "COMPLETED", override: { preprocessingReference: "" } },
    { status: "COMPLETED", override: { failureCode: "TIMEOUT" } },
    { status: "COMPLETED", override: { result: null } },
    { status: "FAILED", override: { finishedAt: null } },
    { status: "FAILED", override: { failureCode: null } },
    { status: "FAILED", override: { failureCode: "private-provider-error" } },
    { status: "FAILED", override: { result: { target: "lvef_lte_45", score: 0 } } },
    { status: "FAILED", override: { modelName: "reported-model", modelVersion: null } },
    { status: "PROCESSING", override: { startedAt: "2026-11-16T09:59:59.000Z" } },
    { status: "COMPLETED", override: { finishedAt: REQUESTED_AT } },
    { status: "FAILED", override: { startedAt: null, finishedAt: "2026-11-16T09:59:59.000Z" } },
    { status: "COMPLETED", override: { finishedAt: "invalid" } },
    { status: "PENDING", override: { analysisId: "another-request" } },
    { status: "PENDING", override: { status: "UNKNOWN" } },
    { status: "PENDING", override: { extra: 1 } },
  ];
  it.each(invalidFields)("rechaza invariantes de estado/fecha/procedencia %#", ({ status, override }) => {
    expectRejected({ ...document(), components: { e022: { ...execution("e022", status), ...override } } });
  });

  it.each(ANALYSIS_FAILURE_CODES)("admite fallo genérico %s antes de invocar sin inventar versión", (failureCode) => {
    const report = parseUnifiedReport({ ...document(), components: { e022: {
      ...execution("e022", "FAILED"), failureCode, startedAt: null,
      finishedAt: REQUESTED_AT, preprocessingReference: "configured-reference",
    } } });
    expect(report.components.e022).toMatchObject({
      status: "FAILED", failureCode, modelName: null, modelVersion: null,
      result: null, preprocessingReference: "configured-reference",
    });
    expect(publishUnifiedReport(report).coverage).toBe("NONE");
  });

  it("admite fechas iguales sin introducir reloj global", () => {
    const report = document(undefined, "COMPLETED");
    report.components.e022.startedAt = REQUESTED_AT;
    report.components.e022.finishedAt = REQUESTED_AT;
    expect(publishUnifiedReport(report).coverage).toBe("PARTIAL");
  });

  it.each([0, 1])("acepta score E022 en el límite %s", (score) => {
    const report = document(undefined, "COMPLETED");
    report.components.e022.result = { target: "lvef_lte_45", score };
    expect(publishUnifiedReport(report).coverage).toBe("PARTIAL");
  });

  it.each([
    { target: "lvef", score: 0.5 }, { target: "lvef_lte_45" },
    { target: "lvef_lte_45", score: -0.01 }, { target: "lvef_lte_45", score: 1.01 },
    { target: "lvef_lte_45", score: NaN }, { target: "lvef_lte_45", score: Infinity },
    { target: "lvef_lte_45", score: -Infinity }, { target: "lvef_lte_45", score: "0.5" },
    { target: "lvef_lte_45", score: 0.5, fevi: 50 },
  ])("rechaza resultado E022 inválido %# entero sin publicación", (result) => {
    expectRejected({ ...document(), components: { e022: { ...execution("e022", "COMPLETED"), result } } });
  });

  it.each(FINDING_KEYS)("rechaza EchoNext completo si %s falta, sobra o es inválido", (key) => {
    const missing: Record<string, number> = { ...probabilities() };
    delete missing[key];
    for (const result of [missing, { ...probabilities(), extra: 0.5 }, ...[
      NaN, Infinity, -Infinity, -0.01, 1.01, "0.5", null,
    ].map((value) => ({ ...probabilities(), [key]: value }))]) {
      expectRejected({ ...document("COMPLETED", "FAILED"), components: {
        echonext: { ...execution("echonext", "COMPLETED"), result }, e022: execution("e022", "FAILED"),
      } });
    }
  });
});
