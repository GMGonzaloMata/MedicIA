import type { NewStudy, StudyRepository } from "@/modules/studies/application/ports/out/study-repository";
import type { StudyListItem, StudyRecord } from "@/modules/studies/domain/study";

// Cumple el puerto en memoria. Guarda la persona que cargó cada estudio para que la lista pueda decir
// quién fue; las pruebas registran a esas personas con `registerUploader`.
export class InMemoryStudyRepository implements StudyRepository {
  private readonly studies: StudyRecord[] = [];
  private readonly counters = new Map<string, number>();
  private readonly uploaders = new Map<string, { fullName: string; isPatient: boolean }>();

  // Para simular una falla de la base en la inserción (el número no se consume).
  failNextInsert = false;

  registerUploader(userId: string, uploader: { fullName: string; isPatient: boolean }): void {
    this.uploaders.set(userId, uploader);
  }

  async insertWithNextNumber(study: NewStudy): Promise<StudyRecord> {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error("falla simulada de la base");
    }

    const next = (this.counters.get(study.patientId) ?? 0) + 1;
    this.counters.set(study.patientId, next);

    const record: StudyRecord = {
      ...study,
      number: next,
      status: "UPLOADED",
      uploadedAt: new Date(),
    };
    this.studies.push(record);

    return record;
  }

  async findById({ tenantId, studyId }: { tenantId: string; studyId: string }): Promise<StudyRecord | null> {
    return this.studies.find((study) => study.tenantId === tenantId && study.id === studyId) ?? null;
  }

  async listByPatient(input: {
    tenantId: string;
    patientId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: StudyListItem[]; totalItems: number }> {
    const all = this.studies
      .filter((study) => study.tenantId === input.tenantId && study.patientId === input.patientId)
      .sort((first, second) => second.number - first.number);
    const start = (input.page - 1) * input.pageSize;

    return {
      totalItems: all.length,
      items: all.slice(start, start + input.pageSize).map((study) => {
        const uploader = this.uploaders.get(study.uploadedByUserId);

        return {
          id: study.id,
          number: study.number,
          type: study.type,
          status: study.status,
          uploadedAt: study.uploadedAt,
          uploadedByUserId: study.uploadedByUserId,
          uploaderName: uploader?.fullName ?? "Sin nombre",
          uploadedByPatient: uploader?.isPatient ?? false,
        };
      }),
    };
  }

  async deleteById({ tenantId, studyId }: { tenantId: string; studyId: string }): Promise<boolean> {
    const index = this.studies.findIndex((study) => study.tenantId === tenantId && study.id === studyId);
    if (index === -1) {
      return false;
    }

    this.studies.splice(index, 1);
    return true;
  }

  async findExistingStorageKeys(storageKeys: string[]): Promise<Set<string>> {
    const known = new Set(this.studies.map((study) => study.storageKey));

    return new Set(storageKeys.filter((key) => known.has(key)));
  }

  // Ayuda para las pruebas: todo lo guardado, sin filtrar por clínica.
  all(): StudyRecord[] {
    return [...this.studies];
  }
}
