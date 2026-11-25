import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type { AssignmentRepository } from "../../application/ports/out/assignment-repository";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Toda consulta lleva `tenantId` del actor. La clave foránea compuesta de la tabla impide además asignar entre
// clínicas distintas aunque el código se equivocara.
export const prismaAssignmentRepository: AssignmentRepository = {
  async findTarget({ tenantId, patientId, membershipId }) {
    const [patient, membership] = await Promise.all([
      prismaClient.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } }),
      prismaClient.staffMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { isDoctor: true, status: true },
      }),
    ]);

    return { patientExists: patient !== null, doctor: membership };
  },

  async create({ tenantId, patientId, membershipId, createdByUserId }) {
    try {
      const row = await prismaClient.doctorPatientAssignment.create({
        data: { tenantId, patientId, membershipId, createdByUserId },
        select: { id: true },
      });

      return { kind: "created", assignmentId: row.id };
    } catch (error) {
      // El índice único parcial no deja dos asignaciones vigentes para el mismo médico y paciente.
      if (isUniqueViolation(error)) {
        return { kind: "already-assigned" };
      }

      throw error;
    }
  },

  async end({ tenantId, assignmentId, endedByUserId, now }) {
    // La condición `endedAt: null` evita terminar dos veces la misma asignación si dos pedidos llegan juntos.
    const result = await prismaClient.doctorPatientAssignment.updateMany({
      where: { id: assignmentId, tenantId, endedAt: null },
      data: { endedAt: now, endedByUserId },
    });

    if (result.count === 1) {
      return { kind: "ended" };
    }

    const existing = await prismaClient.doctorPatientAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: { id: true },
    });

    return { kind: existing ? "already-ended" : "not-found" };
  },

  async listActiveDoctorStatuses({ tenantId, patientId }) {
    const rows = await prismaClient.doctorPatientAssignment.findMany({
      where: { tenantId, patientId, endedAt: null },
      select: { membership: { select: { status: true } } },
    });

    return rows.map((row) => row.membership.status);
  },
};
