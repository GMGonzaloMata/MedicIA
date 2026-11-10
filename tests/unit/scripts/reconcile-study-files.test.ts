import { describe, expect, it } from "vitest";

import { parseArguments } from "../../../scripts/reconcile-study-files.ts";

describe("script de conciliación de estudios", () => {
  it("por defecto solo informa y deja afuera lo de la última hora", () => {
    expect(parseArguments([])).toEqual({ apply: false, minAgeMinutes: 60 });
  });

  it("acepta --apply y --min-age", () => {
    expect(parseArguments(["--apply", "--min-age", "0"])).toEqual({ apply: true, minAgeMinutes: 0 });
    expect(parseArguments(["--min-age", "15"])).toEqual({ apply: false, minAgeMinutes: 15 });
  });

  it("rechaza un mínimo inválido y los argumentos desconocidos", () => {
    expect(() => parseArguments(["--min-age"])).toThrow(/minutos/);
    expect(() => parseArguments(["--min-age", "-5"])).toThrow(/minutos/);
    expect(() => parseArguments(["--min-age", "abc"])).toThrow(/minutos/);
    expect(() => parseArguments(["--borrar"])).toThrow(/--borrar/);
  });
});
