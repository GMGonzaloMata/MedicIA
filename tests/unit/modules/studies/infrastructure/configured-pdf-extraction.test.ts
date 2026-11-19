import { afterEach, expect, it, vi } from "vitest";
import { createConfiguredPdfExtraction } from "@/modules/studies/infrastructure/adapters/create-configured-pdf-extraction";

const composition = vi.hoisted(() => ({ upload: vi.fn(), request: vi.fn(), uploadFactory: vi.fn(), requestFactory: vi.fn(), storage: vi.fn(), legacyInference: vi.fn() }));
vi.mock("@/modules/studies/infrastructure/repositories/prisma-study-repository", () => ({ prismaStudyRepository: {} }));
vi.mock("@/modules/studies/infrastructure/repositories/prisma-patient-directory", () => ({ prismaPatientDirectory: {} }));
vi.mock("@/modules/analyses/infrastructure/repositories/prisma-analysis-repository", () => ({ prismaAnalysisRepository: {} }));
vi.mock("@/modules/studies/infrastructure/adapters/create-study-file-storage", () => ({ createStudyFileStorage: composition.storage }));
vi.mock("@/modules/analyses/infrastructure/adapters/create-model-inference", () => ({ createModelInference: composition.legacyInference }));
vi.mock("@/modules/studies/application/use-cases/upload-pdf-study", () => ({ createUploadPdfStudy: composition.uploadFactory }));
vi.mock("@/modules/analyses/application/use-cases/request-integrated-analysis", () => ({ createRequestIntegratedAnalysis: composition.requestFactory }));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("no configura un fake por defecto ni lee el PDF sin endpoint", () => {
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", "");
  expect(createConfiguredPdfExtraction()).toBeNull();
});
it("permite HTTPS explícito y conserva los rechazos públicos del cliente existente", async () => {
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", "https://reader.internal/extract");
  const transport = vi.spyOn(globalThis, "fetch");
  const reader = createConfiguredPdfExtraction();
  expect(reader).not.toBeNull();
  await expect(reader?.extract({ bytes: new Uint8Array(), signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: "FILE_MISSING", message: "Elegí un archivo para subir." });
  expect(transport).not.toHaveBeenCalled();
});
it.each(["http://127.0.0.1:18081/extract", "invalid", "https://user:secret@reader.internal", "https://reader.internal/#x"])("config inválida falla cerrada: %s", (endpoint) => {
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", endpoint);
  vi.stubEnv("PDF_E022_LOCAL_SYNTHETIC", "");
  expect(createConfiguredPdfExtraction()).toBeNull();
});
it.each(["development", "test"])("loopback requiere selección sintética explícita fuera de producción: %s", (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("PDF_E022_LOCAL_SYNTHETIC", "1");
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", "http://127.0.0.1:18081/extract");
  expect(createConfiguredPdfExtraction()).not.toBeNull();
});
it.each(["production", ""])("no habilita HTTP por flag fuera de modos locales conocidos: %s", (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("PDF_E022_LOCAL_SYNTHETIC", "1");
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", "http://127.0.0.1:18081/extract");
  expect(createConfiguredPdfExtraction()).toBeNull();
});
it("flag local no habilita hosts remotos", () => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PDF_E022_LOCAL_SYNTHETIC", "1");
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", "http://localhost.evil.invalid/extract");
  expect(createConfiguredPdfExtraction()).toBeNull();
});

it("raíces reales resuelven config tarde, preservan inyección/consulta y no inicializan inferencia legacy", async () => {
  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", ""); vi.stubEnv("E022_INFERENCE_ENDPOINT", "");
  composition.uploadFactory.mockReturnValue(composition.upload);
  composition.requestFactory.mockReturnValue(composition.request);
  composition.storage.mockReturnValue({});
  const studies = await import("@/modules/studies/composition");
  const analyses = await import("@/modules/analyses/composition");
  const uploadInput = { actor: { kind: "PATIENT" as const, tenantId: "synthetic-tenant", userId: "synthetic-user", patientId: "synthetic-patient" },
    patientId: "synthetic-patient", type: "ECG", readBytes: vi.fn(), signal: new AbortController().signal };
  const requestInput = { actor: uploadInput.actor, studyId: "synthetic-study", capability: "ECG_UNIFIED_V1" as const };
  await expect(studies.uploadConfiguredPdfStudy(uploadInput)).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE" });
  await expect(analyses.requestConfiguredIntegratedAnalysis(requestInput)).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  expect(composition.storage).not.toHaveBeenCalled(); expect(composition.requestFactory).not.toHaveBeenCalled();
  expect(analyses.createIntegratedReportQuery()).toBeTypeOf("function");
  expect(composition.legacyInference).not.toHaveBeenCalled(); expect(uploadInput.readBytes).not.toHaveBeenCalled();

  vi.stubEnv("PDF_EXTRACTION_ENDPOINT", "https://reader.internal/extract");
  composition.upload.mockResolvedValue({ studyId: "synthetic-study", number: 1 });
  await expect(studies.uploadConfiguredPdfStudy(uploadInput)).resolves.toEqual({ studyId: "synthetic-study", number: 1 });
  expect(composition.upload).toHaveBeenCalledExactlyOnceWith(uploadInput);
  expect(composition.uploadFactory.mock.calls[0][0].extraction.extract).toBeTypeOf("function");
  const explicitExtraction = { extract: vi.fn() };
  expect(studies.getStudiesModule().createUploadPdfStudy(explicitExtraction)).toBe(composition.upload);
  expect(composition.uploadFactory.mock.calls[1][0].extraction).toBe(explicitExtraction);

  vi.stubEnv("E022_INFERENCE_ENDPOINT", "https://e022.internal/invocations");
  vi.stubEnv("E022_MODEL_SHA256", "a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96");
  vi.stubEnv("E022_PREPROCESSING_SHA256", "243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9");
  composition.request.mockResolvedValue({ analysis: "synthetic-publication", run: vi.fn() });
  await analyses.requestConfiguredIntegratedAnalysis(requestInput);
  expect(composition.request).toHaveBeenCalledExactlyOnceWith(requestInput);
  const connected = composition.requestFactory.mock.calls[0][0];
  expect(connected.rawEcgInference.getCapabilities()).toMatchObject({ e022: { status: "AVAILABLE" }, echonext: { status: "NOT_AVAILABLE" } });
  const explicitInference = { getCapabilities: vi.fn(), predict: vi.fn() };
  const source = analyses.createPdfAnalysisStudySource();
  expect(analyses.createIntegratedAnalysesModule({ studySource: source, rawEcgInference: explicitInference }).requestIntegratedAnalysis).toBe(composition.request);
  expect(composition.requestFactory.mock.calls[1][0]).toMatchObject({ studySource: source, rawEcgInference: explicitInference });
  expect(composition.legacyInference).not.toHaveBeenCalled(); expect(uploadInput.readBytes).not.toHaveBeenCalled();
});
