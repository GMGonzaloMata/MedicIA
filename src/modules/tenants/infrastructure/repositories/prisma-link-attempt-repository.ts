import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { LinkAttemptRepository } from "../../application/ports/out/link-attempt-repository";

// Solo guarda la cuenta y el momento del intento fallido: nunca el documento, el código ni la clínica.
export const prismaLinkAttemptRepository: LinkAttemptRepository = {
  async countFailuresSince({ userId, since }) {
    return prismaClient.patientLinkAttempt.count({ where: { userId, attemptedAt: { gte: since } } });
  },

  async recordFailure({ userId, now, purgeBefore }) {
    await prismaClient.$transaction([
      prismaClient.patientLinkAttempt.deleteMany({ where: { userId, attemptedAt: { lt: purgeBefore } } }),
      prismaClient.patientLinkAttempt.create({ data: { userId, attemptedAt: now } }),
    ]);
  },
};
