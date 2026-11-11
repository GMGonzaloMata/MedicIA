import type { AnalysisRepository } from "@/modules/analyses/application/ports/out/analysis-repository";
import { isInProgress, type AnalysisEntry, type AnalysisRequester } from "@/modules/analyses/domain/analysis";
import { AnalysisInProgressError } from "@/modules/analyses/domain/analysis-errors";

// Cumple el puerto en memoria, con las mismas condiciones de estado y el rechazo de un segundo análisis en curso por
// estudio. Las pruebas registran quién pide con `registerRequester` y mueven fechas con `setRequestedAt`.
export class InMemoryAnalysisRepository implements AnalysisRepository {
  private readonly entries: AnalysisEntry[] = [];
  private readonly requesters = new Map<string, AnalysisRequester>();
  private sequence = 0;
  private clock = 0;

  constructor(private readonly currentTime: () => Date = () => new Date()) {}

  registerRequester(userId: string, requester: AnalysisRequester): void {
    this.requesters.set(userId, requester);
  }

  all(): AnalysisEntry[] {
    return [...this.entries];
  }

  setRequestedAt(analysisId: string, requestedAt: Date): void {
    const entry = this.entries.find((candidate) => candidate.id === analysisId);

    if (entry) {
      entry.requestedAt = requestedAt;
    }
  }

  private create(
    input: { tenantId: string; studyId: string; requestedByUserId: string },
    fields: Partial<AnalysisEntry>,
  ): AnalysisEntry {
    this.sequence += 1;
    // Cada análisis nuevo se pide un milisegundo después del anterior, para que el orden sea estable.
    this.clock += 1;

    const entry: AnalysisEntry = {
      id: `analysis-${this.sequence}`,
      tenantId: input.tenantId,
      studyId: input.studyId,
      requestedByUserId: input.requestedByUserId,
      status: "PENDING",
      failureCode: null,
      modelName: null,
      modelVersion: null,
      probabilities: null,
      requestedAt: new Date(this.currentTime().getTime() + this.clock),
      startedAt: null,
      finishedAt: null,
      requestedBy: this.requesters.get(input.requestedByUserId) ?? {
        kind: "DOCTOR",
        fullName: "Dra. Pérez",
      },
      ...fields,
    };

    this.entries.push(entry);

    return entry;
  }

  private find(input: { tenantId: string; studyId: string; analysisId: string }): AnalysisEntry | undefined {
    return this.entries.find(
      (entry) => entry.tenantId === input.tenantId && entry.studyId === input.studyId && entry.id === input.analysisId,
    );
  }

  async insertPending(input: { tenantId: string; studyId: string; requestedByUserId: string }) {
    const inProgress = this.entries.some(
      (entry) => entry.studyId === input.studyId && entry.tenantId === input.tenantId && isInProgress(entry.status),
    );

    if (inProgress) {
      throw new AnalysisInProgressError();
    }

    return this.create(input, {});
  }

  async insertFailed(input: Parameters<AnalysisRepository["insertFailed"]>[0]) {
    return this.create(input, {
      status: "FAILED",
      failureCode: input.failureCode,
      finishedAt: input.finishedAt,
    });
  }

  async claim(input: Parameters<AnalysisRepository["claim"]>[0]) {
    const entry = this.find(input);

    if (entry?.status !== "PENDING") {
      return false;
    }

    entry.status = "PROCESSING";
    entry.startedAt = input.startedAt;

    return true;
  }

  async complete(input: Parameters<AnalysisRepository["complete"]>[0]) {
    const entry = this.find(input);

    if (entry?.status !== "PROCESSING") {
      return false;
    }

    entry.status = "COMPLETED";
    entry.modelName = input.modelName;
    entry.modelVersion = input.modelVersion;
    entry.probabilities = input.probabilities;
    entry.finishedAt = input.finishedAt;

    return true;
  }

  async fail(input: Parameters<AnalysisRepository["fail"]>[0]) {
    const entry = this.find(input);

    if (!entry || !isInProgress(entry.status)) {
      return false;
    }

    entry.status = "FAILED";
    entry.failureCode = input.failureCode;
    entry.finishedAt = input.finishedAt;

    return true;
  }

  async failStale(input: Parameters<AnalysisRepository["failStale"]>[0]) {
    let count = 0;

    for (const entry of this.entries) {
      if (
        entry.tenantId === input.tenantId &&
        entry.studyId === input.studyId &&
        isInProgress(entry.status) &&
        entry.requestedAt < input.olderThan
      ) {
        entry.status = "FAILED";
        entry.failureCode = "TIMEOUT";
        entry.finishedAt = input.finishedAt;
        count += 1;
      }
    }

    return count;
  }

  async findById(input: { tenantId: string; studyId: string; analysisId: string }) {
    return this.find(input) ?? null;
  }

  async listByStudy({ tenantId, studyId }: { tenantId: string; studyId: string }) {
    return this.entries
      .filter((entry) => entry.tenantId === tenantId && entry.studyId === studyId)
      .sort((first, second) => second.requestedAt.getTime() - first.requestedAt.getTime());
  }

  async hasInProgress({ tenantId, studyId, since }: { tenantId: string; studyId: string; since: Date }) {
    return this.entries.some(
      (entry) =>
        entry.tenantId === tenantId &&
        entry.studyId === studyId &&
        isInProgress(entry.status) &&
        entry.requestedAt >= since,
    );
  }
}
