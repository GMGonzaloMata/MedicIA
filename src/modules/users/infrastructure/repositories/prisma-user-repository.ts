import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type { UserRepository } from "../../application/ports/out/user-repository";
import type { AccessUser } from "../../domain/access-context";
import { AccountConflictError } from "../../domain/identity-errors";

const ACCESS_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isPlatformAdmin: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function findBySubject(subject: string): Promise<AccessUser | null> {
  return prismaClient.user.findUnique({
    where: { cognitoSub: subject },
    select: ACCESS_USER_SELECT,
  });
}

export const prismaUserRepository: UserRepository = {
  async upsertFromIdentity({ subject, email, fullName, now }) {
    const existing = await findBySubject(subject);

    if (existing) {
      return existing;
    }

    try {
      return await prismaClient.user.create({
        data: {
          cognitoSub: subject,
          email: email.toLowerCase(),
          fullName,
          // Misma hora que la sesión que se crea a continuación: con el reloj de la base, la
          // sesión del primer ingreso podría nacer anterior a esta fecha y quedar invalidada.
          sessionsValidFrom: now,
          createdAt: now,
        },
        select: ACCESS_USER_SELECT,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // Dos ingresos simultáneos de la misma persona: el segundo reutiliza la cuenta del primero.
      const created = await findBySubject(subject);

      if (created) {
        return created;
      }

      // Si no existe con ese `subject`, el correo pertenece a otra cuenta.
      throw new AccountConflictError();
    }
  },

  async invalidateSessionsByEmail({ email, now }) {
    await prismaClient.user.updateMany({
      // Nunca se retrocede la fecha: solo se adelanta.
      where: { email: email.toLowerCase(), sessionsValidFrom: { lt: now } },
      data: { sessionsValidFrom: now },
    });
  },
};
