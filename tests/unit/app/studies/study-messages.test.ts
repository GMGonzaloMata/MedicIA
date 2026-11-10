import { describe, expect, it } from "vitest";

import { STUDY_MESSAGES, formatUploadedAt, savedMessage } from "@/app/(dashboard)/_studies/_lib/study-messages";
import { REJECTION_CODES, describeRejection } from "@/modules/studies/domain/study-errors";

describe("textos de las pantallas de estudios", () => {
  it("todos están en español rioplatense y sin valores interpolados", () => {
    for (const message of Object.values(STUDY_MESSAGES)) {
      expect(message.length).toBeGreaterThan(5);
      expect(message).not.toMatch(/\$\{|undefined|null/);
    }

    expect(STUDY_MESSAGES.noPatients).toContain("tenés");
    expect(STUDY_MESSAGES.adminWithoutStudies).toBe("Tu vínculo con la clínica no incluye estudios.");
  });

  it("el tamaño máximo coincide con el mensaje del dominio", () => {
    expect(STUDY_MESSAGES.fileTooLarge).toBe(describeRejection("FILE_TOO_LARGE"));
  });

  it("cada código de rechazo tiene un mensaje que nombra el requisito", () => {
    for (const code of REJECTION_CODES) {
      expect(describeRejection(code, "waveform").trim()).toMatch(/[.]$/);
    }
  });

  it("arma el aviso de estudio guardado y la fecha en hora argentina", () => {
    expect(savedMessage(7)).toBe("Estudio 7 guardado.");
    expect(formatUploadedAt(new Date("2026-11-10T15:30:00Z"))).toMatch(/10\/11\/26.*12:30/);
  });
});
