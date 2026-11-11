import {
  INVITATION_TTL_MS,
  type DocumentType,
  type InvitationKind,
  type InvitationSummary,
} from "../../domain/invitation";
import { canInvite, assignsCreator, type InvitationActor } from "../../domain/invitation-access";
import { InvitationForbiddenError, InvitationInputError } from "../../domain/invitation-errors";
import { normalizeProof } from "../../domain/invitation-proof";
import { generateInvitationToken, hashInvitationToken } from "../../domain/invitation-token";
import type { InvitationMailer } from "../ports/out/invitation-mailer";
import type { InvitationRepository, NewInvitation } from "../ports/out/invitation-repository";
import { createInvitationSchema } from "../validation/invitation-form-schemas";

export interface CreateInvitationInput {
  actor: InvitationActor;
  kind: InvitationKind;
  email: string;
  documentType?: DocumentType;
  documentNumber?: string;
  licenseNumber?: string;
}

export type CreateInvitationConflictReason = "ALREADY_STAFF" | "ALREADY_PATIENT" | "DOCUMENT_IN_USE" | "LICENSE_IN_USE";

// La pantalla de crear no muestra quién generó el link (es quien está mirando), así que el resumen no lo incluye.
export type CreatedInvitation = Omit<InvitationSummary, "createdByName">;

export type CreateInvitationResult =
  | { status: "SENT"; invitation: CreatedInvitation }
  | { status: "SEND_FAILED"; invitation: CreatedInvitation }
  | { status: "CONFLICT"; reason: CreateInvitationConflictReason };

interface Dependencies {
  invitations: InvitationRepository;
  mailer: InvitationMailer;
  // Dirección pública de la aplicación, ya validada: de acá sale el link del correo. Es una función para que la
  // validación ocurra al invitar y no al armar el módulo.
  appBaseUrl: () => string;
  now: () => Date;
}

// Los datos del tipo de vínculo, ya validados y normalizados.
type Target =
  | { kind: "DOCTOR"; email: string; licenseNumber: string }
  | { kind: "PATIENT"; email: string; documentType: DocumentType; documentNumber: string };

function describeFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? ` código=${error.code}` : "";

  return `${name}${code}`;
}

export function createCreateInvitation({ invitations, mailer, appBaseUrl, now }: Dependencies) {
  // Datos de la clínica del actor que impiden invitar a ese correo. Nunca consulta si la persona tiene cuenta en otra
  // clínica: eso no se revela (specs/009-link-vinculacion/research.md, R6).
  async function findConflict(
    tenantId: string,
    target: Target,
  ): Promise<CreateInvitationConflictReason | null> {
    const { email } = target;
    const facts = await invitations.findClinicFacts({ tenantId, email });

    if (target.kind === "DOCTOR") {
      // Un médico no puede ser a la vez paciente de la clínica (vínculo único por clínica).
      if (facts.patient) {
        return "ALREADY_PATIENT";
      }

      const owner = await invitations.findLicenseOwner({ tenantId, licenseNumber: target.licenseNumber });

      // La matrícula es de otro integrante; si es de la propia persona invitada no hay conflicto.
      return owner && owner.email !== email ? "LICENSE_IN_USE" : null;
    }

    // Un paciente no puede ser a la vez personal de la clínica.
    if (facts.staff) {
      return "ALREADY_STAFF";
    }

    const owner = await invitations.findDocumentOwner({
      tenantId,
      documentType: target.documentType,
      documentNumber: target.documentNumber,
    });

    // El documento es de otra cuenta. Un registro sin cuenta (pendiente) o de la propia persona no es conflicto.
    return owner?.email && owner.email !== email ? "DOCUMENT_IN_USE" : null;
  }

  function toNewInvitation(
    actor: InvitationActor,
    target: Target,
    tokenHash: string,
    expiresAt: Date,
  ): NewInvitation {
    return {
      tenantId: actor.tenantId,
      kind: target.kind,
      email: target.email,
      tokenHash,
      documentType: target.kind === "PATIENT" ? target.documentType : null,
      documentNumber: target.kind === "PATIENT" ? target.documentNumber : null,
      licenseNumber: target.kind === "DOCTOR" ? target.licenseNumber : null,
      createdByMembershipId: actor.membershipId,
      createdByUserId: actor.userId,
      assignToCreator: assignsCreator(actor, target.kind),
      expiresAt,
    };
  }

  return async function createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const { actor, kind } = input;

    if (!canInvite(actor, kind)) {
      throw new InvitationForbiddenError();
    }

    // Los campos que no se mandaron no cuentan: el esquema rechaza los que sobran para el tipo.
    const candidate = Object.fromEntries(
      Object.entries({
        kind,
        email: input.email,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        licenseNumber: input.licenseNumber,
      }).filter(([, value]) => value !== undefined),
    );
    const parsed = createInvitationSchema.safeParse(candidate);

    if (!parsed.success) {
      throw new InvitationInputError();
    }

    const target: Target =
      parsed.data.kind === "DOCTOR"
        ? { kind: "DOCTOR", email: parsed.data.email, licenseNumber: normalizeProof(parsed.data.licenseNumber) }
        : {
            kind: "PATIENT",
            email: parsed.data.email,
            documentType: parsed.data.documentType,
            documentNumber: normalizeProof(parsed.data.documentNumber),
          };
    const conflict = await findConflict(actor.tenantId, target);

    if (conflict) {
      return { status: "CONFLICT", reason: conflict };
    }

    const tenantName = await invitations.findTenantName({ tenantId: actor.tenantId });

    if (!tenantName) {
      throw new InvitationForbiddenError();
    }

    const moment = now();
    const token = generateInvitationToken();
    const record = await invitations.createReplacing(
      toNewInvitation(actor, target, hashInvitationToken(token), new Date(moment.getTime() + INVITATION_TTL_MS)),
      moment,
    );
    const summary: CreatedInvitation = {
      id: record.id,
      kind: record.kind,
      email: record.email,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      sentAt: null,
    };

    try {
      await mailer.send({
        to: target.email,
        clinicName: tenantName,
        kind,
        link: `${appBaseUrl()}/invite/${token}`,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      // Solo el nombre y el código del error: nunca el destinatario, el link ni la respuesta del servicio.
      console.error(`[invitaciones] no se pudo enviar el correo (${describeFailure(error)})`);

      return { status: "SEND_FAILED", invitation: summary };
    }

    const sentAt = now();
    await invitations.markSent({ tenantId: actor.tenantId, invitationId: record.id, now: sentAt });

    return { status: "SENT", invitation: { ...summary, sentAt } };
  };
}
