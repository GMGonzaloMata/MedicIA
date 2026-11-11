import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type {
  AcceptanceTransaction,
  InvitationRepository,
} from "../../application/ports/out/invitation-repository";
import { INVITATION_MAX_FAILED_ATTEMPTS, type InvitationRecord } from "../../domain/invitation";
import { createRelationshipTransaction, isUniqueViolation } from "./relationship-transaction";

// Operaciones de la transacción de aceptación. Toda consulta lleva la clínica de la invitación.
function createAcceptanceTransaction(tx: Prisma.TransactionClient): AcceptanceTransaction {
  return {
    ...createRelationshipTransaction(tx),

    async claim({ tenantId, invitationId, accountId, now }) {
      const result = await tx.invitation.updateMany({
        where: {
          tenantId,
          id: invitationId,
          status: "PENDING",
          expiresAt: { gt: now },
          failedAttempts: { lt: INVITATION_MAX_FAILED_ATTEMPTS },
        },
        data: { status: "ACCEPTED", acceptedAt: now, acceptedByUserId: accountId },
      });

      return result.count > 0;
    },

    async isMembershipActiveDoctor({ tenantId, membershipId }) {
      const count = await tx.staffMembership.count({
        where: { id: membershipId, tenantId, status: "ACTIVE", isDoctor: true },
      });

      return count > 0;
    },
  };
}

// Toda consulta incluye `tenantId`, salvo la búsqueda por el hash del token (único y secreto): quien la usa valida
// después todo contra la clínica de la invitación. No hay ninguna que busque o escriba una invitación por `id` solo.
export const prismaInvitationRepository: InvitationRepository = {
  async createReplacing(input, now) {
    const attempt = (): Promise<InvitationRecord> =>
      prismaClient.$transaction(async (tx) => {
        const scope = { tenantId: input.tenantId, email: input.email, status: "PENDING" } as const;

        // Los pendientes vencidos se marcan como vencidos; los vigentes, como reemplazados.
        await tx.invitation.updateMany({
          where: { ...scope, expiresAt: { lte: now } },
          data: { status: "EXPIRED" },
        });
        await tx.invitation.updateMany({
          where: scope,
          data: { status: "REVOKED", endReason: "REPLACED", revokedAt: now },
        });

        // `createdAt` con el reloj de la aplicación, igual que `expiresAt` y `sentAt`, para que un desfase con el
        // reloj de la base no rompa los `CHECK` de fechas.
        return tx.invitation.create({ data: { ...input, createdAt: now } });
      });

    try {
      return await attempt();
    } catch (error) {
      // Dos invitaciones simultáneas al mismo correo chocan en el índice único parcial: la segunda reintenta una vez.
      if (isUniqueViolation(error)) {
        return attempt();
      }

      throw error;
    }
  },

  async markSent({ tenantId, invitationId, now }) {
    const result = await prismaClient.invitation.updateMany({
      where: { tenantId, id: invitationId, status: "PENDING", sentAt: null },
      data: { sentAt: now },
    });

    return result.count > 0;
  },

  async listPending({ tenantId, createdByMembershipId, now, limit }) {
    const rows = await prismaClient.invitation.findMany({
      where: {
        tenantId,
        status: "PENDING",
        expiresAt: { gt: now },
        // Una clínica suspendida o un emisor con la membresía desactivada invalidan el link (FR-023).
        tenant: { status: "ACTIVE" },
        createdByMembership: { status: "ACTIVE" },
        ...(createdByMembershipId ? { createdByMembershipId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { createdBy: { select: { fullName: true } } },
    });

    return rows.map(({ createdBy, ...record }) => ({ ...record, createdByName: createdBy.fullName }));
  },

  findById({ tenantId, invitationId }) {
    return prismaClient.invitation.findFirst({ where: { tenantId, id: invitationId } });
  },

  async revoke({ tenantId, invitationId, now }) {
    const result = await prismaClient.invitation.updateMany({
      where: { tenantId, id: invitationId, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "REVOKED", endReason: "BY_SENDER", revokedAt: now },
    });

    return result.count > 0;
  },

  async findByTokenHash(tokenHash) {
    const row = await prismaClient.invitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: { select: { name: true, status: true } },
        createdByMembership: { select: { status: true, isDoctor: true } },
      },
    });

    if (!row) {
      return null;
    }

    const { tenant, createdByMembership, ...invitation } = row;

    return {
      invitation,
      tenantName: tenant.name,
      isTenantActive: tenant.status === "ACTIVE",
      creator: { isMembershipActive: createdByMembership.status === "ACTIVE", isDoctor: createdByMembership.isDoctor },
    };
  },

  async registerFailedAttempt({ tenantId, invitationId, now }) {
    // Una sola sentencia: suma el intento y, al llegar al máximo, revoca la invitación. Es atómica, así que dos
    // intentos simultáneos nunca pasan del máximo ni se pisan.
    const rows = await prismaClient.$queryRaw<Array<{ failedAttempts: number }>>`
      UPDATE "invitations"
      SET "failed_attempts" = "failed_attempts" + 1,
          "status" = CASE WHEN "failed_attempts" + 1 >= ${INVITATION_MAX_FAILED_ATTEMPTS}::int
                          THEN 'REVOKED'::"invitation_status" ELSE "status" END,
          "end_reason" = CASE WHEN "failed_attempts" + 1 >= ${INVITATION_MAX_FAILED_ATTEMPTS}::int
                              THEN 'ATTEMPTS_EXCEEDED'::"invitation_end_reason" ELSE "end_reason" END,
          "revoked_at" = CASE WHEN "failed_attempts" + 1 >= ${INVITATION_MAX_FAILED_ATTEMPTS}::int
                              THEN ${now}::timestamptz ELSE "revoked_at" END
      WHERE "id" = ${invitationId}::uuid
        AND "tenant_id" = ${tenantId}::uuid
        AND "status" = 'PENDING'
        AND "failed_attempts" < ${INVITATION_MAX_FAILED_ATTEMPTS}::int
      RETURNING "failed_attempts" AS "failedAttempts"
    `;

    const failedAttempts = rows[0]?.failedAttempts;

    // Sin fila: la invitación ya no estaba pendiente, así que no quedan intentos.
    return { attemptsLeft: failedAttempts === undefined ? 0 : INVITATION_MAX_FAILED_ATTEMPTS - failedAttempts };
  },

  runAcceptance(userId, work) {
    return prismaClient.$transaction(async (tx) => {
      // Bloquea la fila de la cuenta: las aceptaciones de una misma persona se ejecutan una detrás de otra, así la
      // regla del vínculo único por clínica (que cruza dos tablas) no se puede burlar con dos links a la vez.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;

      return work(createAcceptanceTransaction(tx));
    });
  },

  async findClinicFacts({ tenantId, email }) {
    const user = await prismaClient.user.findUnique({ where: { email }, select: { id: true } });

    if (!user) {
      return { staff: null, patient: null };
    }

    const [staff, patient] = await Promise.all([
      prismaClient.staffMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { status: true, isClinicAdmin: true, isDoctor: true },
      }),
      prismaClient.patient.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { status: true },
      }),
    ]);

    return { staff, patient };
  },

  async findDocumentOwner({ tenantId, documentType, documentNumber }) {
    const patient = await prismaClient.patient.findUnique({
      where: { tenantId_documentType_documentNumber: { tenantId, documentType, documentNumber } },
      select: { user: { select: { email: true } } },
    });

    return patient ? { email: patient.user?.email ?? null } : null;
  },

  async findLicenseOwner({ tenantId, licenseNumber }) {
    const membership = await prismaClient.staffMembership.findUnique({
      where: { tenantId_licenseNumber: { tenantId, licenseNumber } },
      select: { user: { select: { email: true } } },
    });

    return membership ? { email: membership.user.email } : null;
  },

  async findTenantName({ tenantId }) {
    const tenant = await prismaClient.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    return tenant?.name ?? null;
  },
};
