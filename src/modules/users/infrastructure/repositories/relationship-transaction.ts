import "server-only";

import { Prisma } from "../../../../../generated/prisma/client";
import type { RelationshipTransaction } from "../../application/ports/out/invitation-repository";
import { InvitationConflictError } from "../../domain/invitation-errors";

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Operaciones para aplicar un vínculo dentro de una transacción con la cuenta bloqueada. Las comparten aceptar un link
// (009) y el alta directa (010). Toda consulta lleva la clínica indicada.
export function createRelationshipTransaction(tx: Prisma.TransactionClient): RelationshipTransaction {
  return {
    async findRelationshipFacts({ tenantId, userId, documentType, documentNumber, licenseNumber }) {
      // En secuencia: dentro de una transacción todas las consultas comparten una sola conexión.
      const staff = await tx.staffMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { id: true, status: true, isClinicAdmin: true, isDoctor: true },
      });
      const patient = await tx.patient.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { id: true, status: true, documentType: true, documentNumber: true },
      });
      const patientByDocument =
        documentType && documentNumber
          ? await tx.patient.findUnique({
              where: { tenantId_documentType_documentNumber: { tenantId, documentType, documentNumber } },
              select: { id: true, userId: true, status: true },
            })
          : null;
      const licenseOwner = licenseNumber
        ? await tx.staffMembership.findUnique({
            where: { tenantId_licenseNumber: { tenantId, licenseNumber } },
            select: { userId: true },
          })
        : null;

      return {
        staff: staff
          ? { membershipId: staff.id, status: staff.status, isClinicAdmin: staff.isClinicAdmin, isDoctor: staff.isDoctor }
          : null,
        patient: patient
          ? {
              patientId: patient.id,
              status: patient.status,
              documentType: patient.documentType,
              documentNumber: patient.documentNumber,
            }
          : null,
        patientByDocument: patientByDocument
          ? { patientId: patientByDocument.id, userId: patientByDocument.userId, status: patientByDocument.status }
          : null,
        licenseOwnerUserId: licenseOwner?.userId ?? null,
      };
    },

    async createDoctorMembership({ tenantId, userId, licenseNumber, specialty }) {
      try {
        const membership = await tx.staffMembership.create({
          data: { tenantId, userId, isDoctor: true, isClinicAdmin: false, specialty, licenseNumber },
          select: { id: true },
        });

        return { membershipId: membership.id };
      } catch (error) {
        // La unicidad de la matrícula por clínica es la última defensa ante un choque entre dos aceptaciones.
        if (isUniqueViolation(error)) {
          throw new InvitationConflictError("LICENSE_IN_USE");
        }

        throw error;
      }
    },

    async linkPatient({ tenantId, userId, fullName, documentType, documentNumber, reusePatientId, now }) {
      if (reusePatientId) {
        // Reutiliza el registro revocado (o el pendiente con ese documento): conserva su historial y su número.
        const result = await tx.patient.updateMany({
          where: { id: reusePatientId, tenantId },
          data: { userId, fullName, status: "LINKED", linkedAt: now, revokedAt: null },
        });

        if (result.count === 0) {
          throw new Error("El registro de paciente a reutilizar no existe en la clínica.");
        }

        return { patientId: reusePatientId };
      }

      try {
        const patient = await tx.patient.create({
          data: { tenantId, userId, fullName, documentType, documentNumber, status: "LINKED", linkedAt: now },
          select: { id: true },
        });

        return { patientId: patient.id };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new InvitationConflictError("DOCUMENT_IN_USE");
        }

        throw error;
      }
    },

    async assignDoctorIfAbsent({ tenantId, membershipId, patientId, createdByUserId, now }) {
      const active = await tx.doctorPatientAssignment.findFirst({
        where: { tenantId, membershipId, patientId, endedAt: null },
        select: { id: true },
      });

      if (active) {
        return { created: false };
      }

      // La cuenta del paciente está bloqueada durante toda la transacción, así que no hay otra aceptación que
      // pueda crear la misma asignación a la vez. El índice único parcial de la 001 es la defensa final.
      await tx.doctorPatientAssignment.create({
        data: { tenantId, membershipId, patientId, createdByUserId, createdAt: now },
      });

      return { created: true };
    },
  };
}
