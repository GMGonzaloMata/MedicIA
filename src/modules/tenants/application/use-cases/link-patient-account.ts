import { isOverAttemptLimit, linkAttemptRetentionStart, linkAttemptWindowStart } from "../../domain/link-attempt-policy";
import { isDocumentType, normalizeDocument } from "../../domain/normalized-values";
import { LINK_CODE_MAX_FAILED_ATTEMPTS, normalizeLinkCode } from "../../domain/patient-link-code";
import type { LinkAttemptRepository } from "../ports/out/link-attempt-repository";
import type { PatientRegistryRepository } from "../ports/out/patient-registry-repository";
import type { SecretGenerator } from "../ports/out/secret-generator";

export interface LinkPatientAccountInput {
  // La persona sale de la sesión, nunca del formulario.
  user: { id: string; fullName: string };
  documentType: string;
  documentNumber: string;
  // Código tal como lo escribió la persona (con o sin guion, en cualquier caso).
  code: string;
}

export type LinkPatientAccountResult =
  | { ok: true; tenantId: string; patientId: string }
  // Forma inválida: no revela nada de la clínica, y no cuenta como intento.
  | { ok: false; code: "INVALID_INPUT" }
  // Un único resultado para documento inexistente, código incorrecto, vencido, usado, reemplazado o bloqueado, y
  // cuenta que ya es paciente de esa clínica: la persona no debe poder distinguir cuál falló.
  | { ok: false; code: "LINK_FAILED" }
  // Se devuelve antes de evaluar el código.
  | { ok: false; code: "TOO_MANY_ATTEMPTS" };

interface LinkPatientAccountDependencies {
  patients: PatientRegistryRepository;
  attempts: LinkAttemptRepository;
  secrets: SecretGenerator;
  now: () => Date;
}

// Vincula la cuenta de una persona con el registro que la clínica le creó, con el documento y el código de un solo
// uso que la clínica le entregó. Cada fallo suma al contador del código (al quinto queda bloqueado) y al de la
// cuenta (con 10 en 15 minutos se frena sin mirar el código).
export function createLinkPatientAccount({ patients, attempts, secrets, now }: LinkPatientAccountDependencies) {
  return async ({ user, documentType, documentNumber, code }: LinkPatientAccountInput): Promise<LinkPatientAccountResult> => {
    const document = normalizeDocument(documentNumber);
    const linkCode = normalizeLinkCode(code);

    if (!isDocumentType(documentType) || document === null || linkCode === null) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    const timestamp = now();
    const recentFailures = await attempts.countFailuresSince({
      userId: user.id,
      since: linkAttemptWindowStart(timestamp),
    });

    if (isOverAttemptLimit(recentFailures)) {
      return { ok: false, code: "TOO_MANY_ATTEMPTS" };
    }

    const candidates = await patients.findLinkCandidates({ documentType, documentNumber: document, now: timestamp });
    const codeHash = secrets.hash(linkCode);
    const match = candidates.find((candidate) => candidate.codeHash === codeHash);

    if (match) {
      const linked = await patients.linkAccount({
        candidate: match,
        user: { id: user.id, fullName: user.fullName },
        now: timestamp,
      });

      if (linked.kind === "linked") {
        return { ok: true, tenantId: match.tenantId, patientId: match.patientId };
      }
    }

    // Fallo: suma a los códigos que se pudieron haber adivinado y a la cuenta. Sin candidatos igual cuenta contra la
    // cuenta, así probar documentos al azar también se frena.
    if (candidates.length > 0) {
      await patients.recordCodeFailure({
        codeIds: candidates.map((candidate) => candidate.codeId),
        maxAttempts: LINK_CODE_MAX_FAILED_ATTEMPTS,
        now: timestamp,
      });
    }

    await attempts.recordFailure({
      userId: user.id,
      now: timestamp,
      purgeBefore: linkAttemptRetentionStart(timestamp),
    });

    return { ok: false, code: "LINK_FAILED" };
  };
}
