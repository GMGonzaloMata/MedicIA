import { describe, expect, it } from "vitest";

import {
  MAX_ABS_STANDARDIZED,
  MAX_ABS_WAVEFORM,
  TABULAR_LENGTH,
  WAVEFORM_LEADS,
  WAVEFORM_SAMPLES,
  validateEcgContent,
  type EcgStudyData,
} from "@/modules/studies/domain/ecg-study";
import { StudyRejectedError } from "@/modules/studies/domain/study-errors";

// Estudio sintético válido: sexo 1 y seis variables estandarizadas dentro del rango.
function validStudy(): EcgStudyData {
  const waveform = new Float32Array(WAVEFORM_SAMPLES * WAVEFORM_LEADS);
  for (let index = 0; index < waveform.length; index += 1) {
    waveform[index] = Math.sin(index / 25);
  }

  return { waveform, tabular: Float32Array.from([1, 0.35, -0.12, 0, 0.4, -0.2, 0.1]) };
}

function rejection(data: EcgStudyData): StudyRejectedError {
  try {
    validateEcgContent(data);
  } catch (error) {
    if (error instanceof StudyRejectedError) {
      return error;
    }
    throw error;
  }
  throw new Error("Se esperaba un rechazo y el estudio fue aceptado.");
}

describe("validateEcgContent", () => {
  it("acepta un estudio válido", () => {
    expect(() => validateEcgContent(validStudy())).not.toThrow();
  });

  it("acepta los valores justo en el límite", () => {
    const data = validStudy();
    data.waveform[0] = MAX_ABS_WAVEFORM;
    data.waveform[1] = -MAX_ABS_WAVEFORM;
    data.tabular[1] = MAX_ABS_STANDARDIZED;
    data.tabular[6] = -MAX_ABS_STANDARDIZED;

    expect(() => validateEcgContent(data)).not.toThrow();
  });

  it("acepta el sexo 0 y el sexo 1", () => {
    for (const sex of [0, 1]) {
      const data = validStudy();
      data.tabular[0] = sex;
      expect(() => validateEcgContent(data)).not.toThrow();
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rechaza un valor no finito en la onda (%s)",
    (value) => {
      const data = validStudy();
      data.waveform[1234] = value;

      const error = rejection(data);

      expect(error.code).toBe("VALUE_NOT_FINITE");
      expect(error.field).toBe("waveform");
    },
  );

  it("rechaza un valor no finito en las variables y nombra su posición, no su valor", () => {
    const data = validStudy();
    data.tabular[3] = Number.NaN;

    const error = rejection(data);

    expect(error.code).toBe("VALUE_NOT_FINITE");
    expect(error.field).toBe("tabular");
    expect(error.message).toContain("variable 4");
    expect(error.message).not.toMatch(/NaN/);
  });

  it.each([2, -1, 0.5, 1.0001])("rechaza el sexo %s", (sex) => {
    const data = validStudy();
    data.tabular[0] = sex;

    expect(rejection(data).code).toBe("SEX_INVALID");
  });

  it("rechaza una variable estandarizada que supera el límite", () => {
    const data = validStudy();
    // Una edad sin estandarizar, como la que pondría quien sube datos crudos.
    data.tabular[1] = 65;

    const error = rejection(data);

    expect(error.code).toBe("VALUE_OUT_OF_RANGE");
    expect(error.field).toBe("tabular");
    expect(error.message).toContain("variable 2");
    expect(error.message).not.toContain("65");
  });

  it("rechaza una muestra de la onda que supera el límite", () => {
    const data = validStudy();
    data.waveform[500] = MAX_ABS_WAVEFORM + 1;

    const error = rejection(data);

    expect(error.code).toBe("VALUE_OUT_OF_RANGE");
    expect(error.field).toBe("waveform");
    expect(error.message).not.toContain(String(MAX_ABS_WAVEFORM + 1));
  });

  it("rechaza una onda o unas variables de otro tamaño", () => {
    const short = validStudy();
    const wrongWaveform = rejection({ waveform: short.waveform.slice(0, 100), tabular: short.tabular });
    const wrongTabular = rejection({ waveform: short.waveform, tabular: short.tabular.slice(0, TABULAR_LENGTH - 1) });

    expect(wrongWaveform.code).toBe("FIELD_SHAPE");
    expect(wrongWaveform.field).toBe("waveform");
    expect(wrongTabular.code).toBe("FIELD_SHAPE");
    expect(wrongTabular.field).toBe("tabular");
  });

  it("los mensajes nombran el campo y la regla", () => {
    const data = validStudy();
    data.waveform[0] = Number.POSITIVE_INFINITY;

    expect(rejection(data).message).toContain("waveform");
  });
});
