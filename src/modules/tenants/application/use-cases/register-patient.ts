import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import { isDocumentType, normalizeDocument } from "../../domain/normalized-values";
import { formatLinkCode, linkCodeExpiresAt } from "../../domain/patient-link-code";
import type { PatientRegistryRepository } from "../ports/out/patient-registry-repository";
import type { SecretGenerator } from "../ports/out/secret-generator";
import type { StaffRepository } from "../ports/out/staff-repository";

export interface RegisterPatientInput {
  actor: ClinicAdminActor;
  documentType: string;
  documentNumber: string;
}

export type RegisterPatientResult =
  // `linkCode` (en claro, `XXXXX-XXXXX`) solo viaja en este resultado: no se guarda ni se vuelve a consultar.
  | { ok: true; patientId: string; linkCode: string }
  | { ok: false; code: "INVALID_INPUT" | "DUPLICATE_PATIENT" | "NOT_FOUND" };

interface RegisterPatientDependencies {
  patients: PatientRegistryRepository;
  staff: StaffRepository;
  secrets: SecretGenerator;
  now: () => Date;
}

// Da de alta a un paciente de la clínica del actor, sin cuenta todavía, y le genera su primer código de
// vinculación. Se identifica solo por el documento, normalizado para que «12.345.678» y «12345678» sean el mismo:
// la base no permite un nombre en un paciente pendiente, que se completa cuando vincula su cuenta.
export function createRegisterPatient({ patients, staff, secrets, now }: RegisterPatientDependencies) {
  return async ({ actor, documentType, documentNumber }: RegisterPatientInput): Promise<RegisterPatientResult> => {
    const document = normalizeDocument(documentNumber);

    if (!isDocumentType(documentType) || document === null) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    // Una clínica suspendida no puede incorporar pacientes.
    const tenant = await staff.findTenant(actor.tenantId);

    if (tenant === null || tenant.status !== "ACTIVE") {
      return { ok: false, code: "NOT_FOUND" };
    }

    const timestamp = now();
    const code = secrets.generateLinkCode();
    const result = await patients.register({
      tenantId: actor.tenantId,
      documentType,
      documentNumber: document,
      codeHash: secrets.hash(code),
      expiresAt: linkCodeExpiresAt(timestamp),
      createdByUserId: actor.userId,
      now: timestamp,
    });

    if (result.kind === "duplicate") {
      return { ok: false, code: "DUPLICATE_PATIENT" };
    }

    return { ok: true, patientId: result.patientId, linkCode: formatLinkCode(code) };
  };
}
