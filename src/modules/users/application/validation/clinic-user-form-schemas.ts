import { z } from "zod";

import { DOCUMENT_TYPES } from "../../domain/invitation";
import { normalizeProof } from "../../domain/invitation-proof";
import { CLINIC_USERS_MAX_PAGE } from "../../domain/clinic-user-rules";
import { FULL_NAME_MAX_LENGTH, FULL_NAME_MIN_LENGTH } from "./account-form-schemas";
import { EMAIL_MAX_LENGTH, PROOF_MAX_LENGTH, SPECIALTY_MAX_LENGTH, SPECIALTY_MIN_LENGTH } from "./invitation-form-schemas";

const email = z.string({ error: "Ingresá un correo válido." }).trim().toLowerCase()
  .pipe(z.email({ error: "Ingresá un correo válido." }).max(EMAIL_MAX_LENGTH, { error: "El correo es demasiado largo." }));
const fullName = z.string({ error: "Ingresá el nombre completo." }).trim()
  .min(FULL_NAME_MIN_LENGTH, { error: `El nombre debe tener al menos ${FULL_NAME_MIN_LENGTH} caracteres.` })
  .max(FULL_NAME_MAX_LENGTH, { error: "El nombre es demasiado largo." });
const proof = (message: string) => z.string({ error: message }).trim()
  .min(1, { error: message })
  .max(PROOF_MAX_LENGTH, { error: `No puede superar los ${PROOF_MAX_LENGTH} caracteres.` })
  .refine((value) => normalizeProof(value).length > 0, { error: message });

export const enrollMemberSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("DOCTOR"), email, fullName,
    licenseNumber: proof("Ingresá la matrícula."),
    specialty: z.string({ error: "Ingresá la especialidad." }).trim()
      .min(SPECIALTY_MIN_LENGTH, { error: `La especialidad debe tener al menos ${SPECIALTY_MIN_LENGTH} caracteres.` })
      .max(SPECIALTY_MAX_LENGTH, { error: `La especialidad no puede superar los ${SPECIALTY_MAX_LENGTH} caracteres.` }),
  }),
  z.strictObject({
    kind: z.literal("PATIENT"), email, fullName,
    documentType: z.enum(DOCUMENT_TYPES, { error: "Elegí el tipo de documento." }),
    documentNumber: proof("Ingresá el número de documento."),
  }),
]);

export const resendTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("STAFF"), membershipId: z.uuid() }),
  z.strictObject({ kind: z.literal("PATIENT"), patientId: z.uuid() }),
]);

export const clinicUsersPageSchema = z.coerce.number().int().min(1).max(CLINIC_USERS_MAX_PAGE);
export type EnrollMemberData = z.infer<typeof enrollMemberSchema>;
