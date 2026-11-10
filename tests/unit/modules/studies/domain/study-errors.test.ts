import { describe, expect, it } from "vitest";

import {
  REJECTION_CODES,
  StudyForbiddenError,
  StudyInUseError,
  StudyNotFoundError,
  StudyRejectedError,
  StudyUnavailableError,
  describeRejection,
} from "@/modules/studies/domain/study-errors";

describe("describeRejection", () => {
  it.each(REJECTION_CODES)("%s tiene un mensaje en español sin valores del estudio", (code) => {
    for (const field of ["waveform", "tabular", undefined] as const) {
      const message = describeRejection(code, field, 3);

      expect(message.length).toBeGreaterThan(10);
      // Solo puede aparecer la posición de la variable, nunca un número de datos.
      expect(message.replace(/2500|12|7|2 MB|float32|float64|variable 3|\.npz|ZIP|0 o 1/g, "")).not.toMatch(/\d/);
    }
  });

  it("nombra el campo que falla", () => {
    expect(describeRejection("FIELD_MISSING", "tabular")).toContain("«tabular»");
    expect(describeRejection("FIELD_DUPLICATED", "waveform")).toContain("«waveform»");
    expect(describeRejection("FIELD_TYPE", "waveform")).toContain("float32 o float64");
    expect(describeRejection("FIELD_CORRUPT", "tabular")).toContain("«tabular»");
  });

  it("indica la forma esperada de cada campo", () => {
    expect(describeRejection("FIELD_SHAPE", "waveform")).toContain("2500 muestras por 12 derivaciones");
    expect(describeRejection("FIELD_SHAPE", "tabular")).toContain("7 valores");
  });

  it("nombra la posición de la variable cuando se conoce", () => {
    expect(describeRejection("VALUE_OUT_OF_RANGE", "tabular", 2)).toContain("variable 2");
    expect(describeRejection("VALUE_NOT_FINITE", "tabular", 5)).toContain("variable 5");
    expect(describeRejection("VALUE_OUT_OF_RANGE", "tabular")).not.toContain("(variable");
    expect(describeRejection("VALUE_NOT_FINITE", "tabular")).not.toContain("(variable");
  });

  it("distingue la onda de las variables en rango y finitud", () => {
    expect(describeRejection("VALUE_OUT_OF_RANGE", "waveform")).toContain("normalizada");
    expect(describeRejection("VALUE_OUT_OF_RANGE", "tabular")).toContain("estandarizados");
    expect(describeRejection("VALUE_NOT_FINITE", "waveform")).toContain("«waveform»");
  });
});

describe("errores de estudios", () => {
  it("StudyRejectedError conserva el código y el campo y usa el mensaje del código", () => {
    const error = new StudyRejectedError("SEX_INVALID", "tabular");

    expect(error.code).toBe("SEX_INVALID");
    expect(error.field).toBe("tabular");
    expect(error.message).toBe(describeRejection("SEX_INVALID", "tabular"));
    expect(error.name).toBe("StudyRejectedError");
  });

  it("los errores de acceso y de disponibilidad tienen un nombre y un mensaje fijos", () => {
    expect(new StudyForbiddenError().name).toBe("StudyForbiddenError");
    expect(new StudyNotFoundError().message).toBe("No encontramos el estudio.");
    expect(new StudyUnavailableError().name).toBe("StudyUnavailableError");
    expect(new StudyInUseError().name).toBe("StudyInUseError");
  });
});
