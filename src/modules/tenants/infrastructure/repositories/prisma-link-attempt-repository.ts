import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { LinkAttemptRepository } from "../../application/ports/out/link-attempt-repository";
import { isOverAttemptLimit } from "../../domain/link-attempt-policy";

// Solo guarda la cuenta y el momento del intento: nunca el documento, el código ni la clínica.
export const prismaLinkAttemptRepository: LinkAttemptRepository = {
  async reserve({ userId, now, windowStart, purgeBefore }) {
    return prismaClient.$transaction(async (transaction) => {
      // Se bloquea la fila de la cuenta: los pedidos simultáneos de una misma cuenta se serializan y cada uno ve los
      // intentos de los anteriores antes de contar.
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      await transaction.patientLinkAttempt.deleteMany({ where: { userId, attemptedAt: { lt: purgeBefore } } });
      const recent = await transaction.patientLinkAttempt.count({ where: { userId, attemptedAt: { gte: windowStart } } });

      if (isOverAttemptLimit(recent)) {
        return false;
      }

      await transaction.patientLinkAttempt.create({ data: { userId, attemptedAt: now } });

      return true;
    });
  },
};
