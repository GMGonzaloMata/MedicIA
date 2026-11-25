import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import { formatLinkCode, linkCodeExpiresAt } from "../../domain/patient-link-code";
import type { PatientRegistryRepository } from "../ports/out/patient-registry-repository";
import type { SecretGenerator } from "../ports/out/secret-generator";

export interface RegeneratePatientLinkCodeInput {
  actor: ClinicAdminActor;
  patientId: string;
}

export type RegeneratePatientLinkCodeResult =
  | { ok: true; linkCode: string }
  // Un paciente de otra clínica o inexistente devuelve lo mismo: no se revela si existe.
  | { ok: false; code: "NOT_FOUND" | "ALREADY_LINKED" };

interface RegeneratePatientLinkCodeDependencies {
  patients: PatientRegistryRepository;
  secrets: SecretGenerator;
  now: () => Date;
}

// Reemplaza el código de un paciente que todavía no vinculó su cuenta (el anterior deja de servir). El código
// nuevo se devuelve una sola vez.
export function createRegeneratePatientLinkCode({ patients, secrets, now }: RegeneratePatientLinkCodeDependencies) {
  return async ({ actor, patientId }: RegeneratePatientLinkCodeInput): Promise<RegeneratePatientLinkCodeResult> => {
    const timestamp = now();
    const code = secrets.generateLinkCode();
    const result = await patients.replaceLinkCode({
      tenantId: actor.tenantId,
      patientId,
      codeHash: secrets.hash(code),
      expiresAt: linkCodeExpiresAt(timestamp),
      createdByUserId: actor.userId,
      now: timestamp,
    });

    if (result.kind === "not-found") {
      return { ok: false, code: "NOT_FOUND" };
    }

    if (result.kind === "already-linked") {
      return { ok: false, code: "ALREADY_LINKED" };
    }

    return { ok: true, linkCode: formatLinkCode(code) };
  };
}
