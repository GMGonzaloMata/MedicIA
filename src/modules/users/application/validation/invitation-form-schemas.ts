import { z } from "zod";

import { DOCUMENT_TYPES } from "../../domain/invitation";
import { normalizeProof } from "../../domain/invitation-proof";

export const EMAIL_MAX_LENGTH = 254;
export const PROOF_MAX_LENGTH = 40;
export const SPECIALTY_MIN_LENGTH = 2;
export const SPECIALTY_MAX_LENGTH = 100;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ingresá un correo válido." }).max(EMAIL_MAX_LENGTH, { error: "El correo es demasiado largo." }));

const documentTypeField = z.enum(DOCUMENT_TYPES, { error: "Elegí el tipo de documento." });

// El documento y la matrícula se normalizan al comparar y al guardar; acá solo se exige que quede algo después de
// quitar espacios, puntos y guiones, y que no sea desmesurado.
const proofField = (message: string) =>
  z
    .string()
    .trim()
    .min(1, { error: message })
    .max(PROOF_MAX_LENGTH, { error: `No puede superar los ${PROOF_MAX_LENGTH} caracteres.` })
    .refine((value) => normalizeProof(value).length > 0, { error: message });

const documentNumberField = proofField("Ingresá el número de documento.");
const licenseNumberField = proofField("Ingresá la matrícula.");

const specialtyField = z
  .string()
  .trim()
  .min(SPECIALTY_MIN_LENGTH, { error: `La especialidad debe tener al menos ${SPECIALTY_MIN_LENGTH} caracteres.` })
  .max(SPECIALTY_MAX_LENGTH, { error: `La especialidad no puede superar los ${SPECIALTY_MAX_LENGTH} caracteres.` });

// Quién invita indica el correo y el tipo de vínculo. Para un paciente, su documento; para un médico, su matrícula.
// Los campos del otro tipo no pueden venir (specs/009-link-vinculacion, FR-004).
export const createInvitationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("DOCTOR"),
    email: emailField,
    licenseNumber: licenseNumberField,
  }),
  z.strictObject({
    kind: z.literal("PATIENT"),
    email: emailField,
    documentType: documentTypeField,
    documentNumber: documentNumberField,
  }),
]);

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// Lo que escribe la persona al aceptar. Qué campos hacen falta depende del tipo de la invitación, que se conoce en el
// servidor: el caso de uso exige los del tipo que corresponde.
export const acceptInvitationSchema = z.object({
  documentType: documentTypeField.optional(),
  documentNumber: documentNumberField.optional(),
  licenseNumber: licenseNumberField.optional(),
  specialty: specialtyField.optional(),
});

export type AcceptInvitationProof = z.infer<typeof acceptInvitationSchema>;

export const invitationIdSchema = z.uuid();
