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
import type { InvitationRepository } from "../ports/out/invitation-repository";
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

function describeFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? ` código=${error.code}` : "";

  return `${name}${code}`;
}

export function createCreateInvitation({ invitations, mailer, appBaseUrl, now }: Dependencies) {
  // Datos de la clínica del actor que impiden invitar a ese correo. Nunca consulta si la persona tiene cuenta en otra
  // clínica: eso no se revela (specs/009-link-vinculacion/research.md, R6).
  async function findConflict(
    actor: InvitationActor,
    email: string,
    licenseNumber: string,
  ): Promise<CreateInvitationConflictReason | null> {
    const facts = await invitations.findClinicFacts({ tenantId: actor.tenantId, email });

    // Un médico no puede ser a la vez paciente de la clínica (vínculo único por clínica).
    if (facts.patient) {
      return "ALREADY_PATIENT";
    }

    const owner = await invitations.findLicenseOwner({ tenantId: actor.tenantId, licenseNumber });

    // La matrícula es de otro integrante; si es de la propia persona invitada no hay conflicto.
    return owner && owner.email !== email ? "LICENSE_IN_USE" : null;
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

    // En esta etapa solo se invita a médicos; la rama de pacientes se agrega con la historia de pacientes.
    if (!parsed.success || parsed.data.kind !== "DOCTOR") {
      throw new InvitationInputError();
    }

    const { email } = parsed.data;
    const licenseNumber = normalizeProof(parsed.data.licenseNumber);
    const conflict = await findConflict(actor, email, licenseNumber);

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
      {
        tenantId: actor.tenantId,
        kind,
        email,
        tokenHash: hashInvitationToken(token),
        documentType: null,
        documentNumber: null,
        licenseNumber,
        createdByMembershipId: actor.membershipId,
        createdByUserId: actor.userId,
        assignToCreator: assignsCreator(actor, kind),
        expiresAt: new Date(moment.getTime() + INVITATION_TTL_MS),
      },
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
        to: email,
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
