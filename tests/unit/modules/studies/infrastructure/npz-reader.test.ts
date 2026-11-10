import { describe, expect, it } from "vitest";

import { StudyRejectedError, type RejectionCode, type StudyField } from "@/modules/studies/domain/study-errors";
import {
  MAX_NPZ_BYTES,
  createNpzStudyFileReader,
} from "@/modules/studies/infrastructure/adapters/npz-reader";

import {
  TABULAR_VALUES,
  WAVEFORM_SHAPE,
  WAVEFORM_VALUES,
  buildNpy,
  buildNpz,
  buildZip,
  syntheticTabular,
  syntheticWaveform,
} from "../../../../support/npz-builder";

const reader = createNpzStudyFileReader();

function rejection(bytes: Uint8Array): StudyRejectedError {
  try {
    reader.read(bytes);
  } catch (error) {
    if (error instanceof StudyRejectedError) {
      return error;
    }
    throw error;
  }
  throw new Error("Se esperaba un rechazo y el archivo fue aceptado.");
}

function expectRejected(bytes: Uint8Array, code: RejectionCode, field?: StudyField) {
  const error = rejection(bytes);

  expect(error.code).toBe(code);
  if (field) {
    expect(error.field).toBe(field);
  }
}

describe("lector de .npz: archivos válidos", () => {
  it("lee la onda y las variables float32 con la forma del conjunto de datos (1, 2500, 12)", () => {
    const { waveform, tabular } = reader.read(buildNpz());

    expect(Array.from(waveform)).toEqual(Array.from(syntheticWaveform()));
    expect(Array.from(tabular)).toEqual(Array.from(syntheticTabular()));
  });

  it("acepta la onda con forma (2500, 12)", () => {
    const bytes = buildNpz({
      waveform: { shape: [2500, 12], values: syntheticWaveform() },
    });

    expect(reader.read(bytes).waveform).toHaveLength(WAVEFORM_VALUES);
  });

  it("convierte float64 a float32", () => {
    const { waveform, tabular } = reader.read(buildNpz({ descr: "<f8" }));

    expect(Array.from(waveform)).toEqual(Array.from(syntheticWaveform()).map(Math.fround));
    expect(Array.from(tabular)).toEqual(Array.from(syntheticTabular()).map(Math.fround));
  });

  it("lee entradas comprimidas con deflate", () => {
    const { waveform } = reader.read(buildNpz({ compress: true }));

    expect(Array.from(waveform)).toEqual(Array.from(syntheticWaveform()));
  });

  it.each([2, 3] as const)("acepta el encabezado de .npy en la versión %i", (version) => {
    const bytes = buildNpz({
      waveform: { shape: WAVEFORM_SHAPE, values: syntheticWaveform(), version },
      tabular: { shape: [TABULAR_VALUES], values: syntheticTabular(), version },
    });

    expect(reader.read(bytes).tabular).toHaveLength(TABULAR_VALUES);
  });

  it("ignora sin leer los campos adicionales", () => {
    const bytes = buildNpz({
      extraEntries: [
        { name: "notas.npy", data: Buffer.from("no es un npy") },
        { name: "nombre.txt", data: Buffer.from("Persona de prueba"), method: 8 },
      ],
    });

    expect(reader.read(bytes).waveform).toHaveLength(WAVEFORM_VALUES);
  });
});

describe("lector de .npz: el contenedor", () => {
  it.each([
    ["vacío", Buffer.alloc(0)],
    ["muy corto", Buffer.from("PK")],
    ["texto cualquiera", Buffer.from("esto no es un zip".repeat(20))],
  ])("rechaza un archivo que no es ZIP (%s)", (name, bytes) => {
    expectRejected(bytes, "NOT_NPZ");
  });

  it("rechaza un ZIP truncado", () => {
    const valid = buildNpz();

    expectRejected(valid.subarray(0, valid.length - 30), "NOT_NPZ");
  });

  it("rechaza un archivo de más de 2 MB antes de leerlo", () => {
    expectRejected(Buffer.alloc(MAX_NPZ_BYTES + 1), "FILE_TOO_LARGE");
  });

  it("rechaza ZIP64", () => {
    expectRejected(buildNpz({ zip: { zip64: true } }), "UNSUPPORTED_ZIP");
  });

  it("rechaza más de 16 entradas", () => {
    const extras = Array.from({ length: 15 }, (value, index) => ({
      name: `extra-${index}.npy`,
      data: Buffer.from("x"),
    }));

    expectRejected(buildNpz({ extraEntries: extras }), "UNSUPPORTED_ZIP");
  });

  it("acepta justo 16 entradas", () => {
    const extras = Array.from({ length: 14 }, (value, index) => ({
      name: `extra-${index}.npy`,
      data: Buffer.from("x"),
    }));

    expect(reader.read(buildNpz({ extraEntries: extras })).tabular).toHaveLength(TABULAR_VALUES);
  });

  it.each([
    ["con ..", "../waveform.npy"],
    ["con barra", "carpeta/dato.npy"],
    ["con barra invertida", "carpeta\\dato.npy"],
    ["absoluto", "/etc/passwd"],
    ["con carácter de control", "dato\u0001.npy"],
    ["de directorio", "carpeta/"],
  ])("rechaza un nombre de entrada peligroso (%s) aunque la entrada se ignore", (label, name) => {
    const error = rejection(buildNpz({ extraEntries: [{ name, data: Buffer.from("x") }] }));

    expect(error.code).toBe("UNSUPPORTED_ZIP");
    // El mensaje no repite el nombre que trajo el archivo.
    expect(error.message).not.toContain("passwd");
    expect(error.message).not.toContain("carpeta");
  });

  it("rechaza un nombre repetido de un campo obligatorio", () => {
    const bytes = buildZip([
      { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE }) },
      { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE }) },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "FIELD_DUPLICATED", "waveform");
  });

  it("rechaza un nombre repetido de una entrada ignorada", () => {
    const bytes = buildNpz({
      extraEntries: [
        { name: "otra.npy", data: Buffer.from("a") },
        { name: "otra.npy", data: Buffer.from("b") },
      ],
    });

    expectRejected(bytes, "UNSUPPORTED_ZIP");
  });

  it.each([
    ["waveform", "tabular.npy"],
    ["tabular", "waveform.npy"],
  ] as const)("rechaza el archivo al que le falta «%s»", (missing, present) => {
    const data = present === "tabular.npy" ? buildNpy({ shape: [TABULAR_VALUES] }) : buildNpy({ shape: WAVEFORM_SHAPE });
    const bytes = buildZip([{ name: present, data }]);

    expectRejected(bytes, "FIELD_MISSING", missing);
  });

  it("rechaza si el nombre del encabezado local no coincide con el del directorio central", () => {
    const bytes = buildZip([
      { name: "waveform.npy", localName: "otro-nombre.npy", data: buildNpy({ shape: WAVEFORM_SHAPE }) },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "NOT_NPZ");
  });

  it("rechaza una entrada cifrada", () => {
    const bytes = buildZip([
      { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE }), flags: 1 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "UNSUPPORTED_ZIP");
  });

  it("rechaza un método de compresión no admitido", () => {
    const bytes = buildZip([
      { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE }), method: 12 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "UNSUPPORTED_ZIP");
  });

  it("rechaza un CRC erróneo", () => {
    const bytes = buildZip([
      { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE }), crc: 12345 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "FIELD_CORRUPT", "waveform");
  });
});

describe("lector de .npz: topes de tamaño y bombas de descompresión", () => {
  it("rechaza si la suma de los tamaños descomprimidos declarados supera 20 MB", () => {
    const bytes = buildNpz({
      extraEntries: [{ name: "grande.bin", data: Buffer.from("x"), declaredUncompressedSize: 21 * 1024 * 1024 }],
    });

    expectRejected(bytes, "EXPANSION_LIMIT");
  });

  it("rechaza una entrada que se expande más de lo que declara (bomba de descompresión)", () => {
    // 5 MB de ceros comprimen a pocos KB; la entrada declara solo 1 KB.
    const bomb = buildZip([
      { name: "waveform.npy", data: Buffer.alloc(5 * 1024 * 1024), method: 8, declaredUncompressedSize: 1024 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expect(bomb.length).toBeLessThan(MAX_NPZ_BYTES);
    expectRejected(bomb, "EXPANSION_LIMIT");
  });

  it("rechaza una entrada obligatoria más grande que cualquier arreglo válido, aunque declare la verdad", () => {
    const big = buildZip([
      { name: "waveform.npy", data: Buffer.alloc(3 * 1024 * 1024), method: 8 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(big, "EXPANSION_LIMIT");
  });

  it("rechaza un tamaño declarado distinto del real en una entrada almacenada", () => {
    const data = buildNpy({ shape: WAVEFORM_SHAPE });
    const bytes = buildZip([
      { name: "waveform.npy", data, declaredUncompressedSize: data.length - 10 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "FIELD_CORRUPT", "waveform");
  });

  it("rechaza un tamaño declarado mayor que el real en una entrada comprimida", () => {
    const data = buildNpy({ shape: WAVEFORM_SHAPE });
    const bytes = buildZip([
      { name: "waveform.npy", data, method: 8, declaredUncompressedSize: data.length + 500 },
      { name: "tabular.npy", data: buildNpy({ shape: [TABULAR_VALUES] }) },
    ]);

    expectRejected(bytes, "FIELD_CORRUPT", "waveform");
  });

  it("rechaza datos comprimidos dañados", () => {
    const valid = buildNpz({ compress: true });
    // Se daña un byte del medio de los datos comprimidos de la onda.
    const damaged = Buffer.from(valid);
    damaged[60] = damaged[60]! ^ 0xff;
    damaged[61] = damaged[61]! ^ 0xff;

    const error = rejection(damaged);

    expect(["FIELD_CORRUPT", "EXPANSION_LIMIT"]).toContain(error.code);
  });
});

describe("lector de .npz: el arreglo .npy", () => {
  it("rechaza un arreglo de objetos (pickle) antes de leer sus datos", () => {
    const evil = buildNpy({ descr: "|O", shape: WAVEFORM_SHAPE, rawData: Buffer.from("cpickle\nsystem\n") });

    expectRejected(buildNpz({ waveform: evil }), "FIELD_TYPE", "waveform");
  });

  it.each(["<i4", ">f4", "<f2", "<u1", "<U5"])("rechaza el tipo %s", (descr) => {
    const array = buildNpy({ descr, shape: [TABULAR_VALUES], rawData: Buffer.alloc(TABULAR_VALUES * 4) });

    expectRejected(buildNpz({ tabular: array }), "FIELD_TYPE", "tabular");
  });

  it("rechaza el orden de Fortran", () => {
    const array = buildNpy({ shape: WAVEFORM_SHAPE, values: syntheticWaveform(), fortranOrder: true });

    expectRejected(buildNpz({ waveform: array }), "FIELD_CORRUPT", "waveform");
  });

  it.each([
    [[2500, 11]],
    [[1, 2500, 13]],
    [[3, 2500, 12]],
    [[1, 12, 2500]],
    [[WAVEFORM_VALUES]],
    [[2500]],
  ])("rechaza la forma %j de la onda", (shape) => {
    expectRejected(buildNpz({ waveform: { shape } }), "FIELD_SHAPE", "waveform");
  });

  it.each([[[6]], [[8]], [[7, 1]], [[1, 7]]])("rechaza la forma %j de las variables", (shape) => {
    expectRejected(buildNpz({ tabular: { shape } }), "FIELD_SHAPE", "tabular");
  });

  it("rechaza datos más cortos que lo que dice el encabezado", () => {
    const short = buildNpy({ shape: WAVEFORM_SHAPE, rawData: Buffer.alloc(100) });

    expectRejected(buildNpz({ waveform: short }), "FIELD_CORRUPT", "waveform");
  });

  it("rechaza datos más largos que lo que dice el encabezado", () => {
    const long = buildNpy({ shape: [TABULAR_VALUES], rawData: Buffer.alloc(TABULAR_VALUES * 4 + 8) });

    expectRejected(buildNpz({ tabular: long }), "FIELD_CORRUPT", "tabular");
  });

  it.each([
    ["no es un diccionario", "esto no es un encabezado"],
    ["código en lugar de la forma", "{'descr': '<f4', 'fortran_order': False, 'shape': __import__('os'), }"],
    ["claves de más", "{'descr': '<f4', 'fortran_order': False, 'shape': (7,), 'extra': 1, }"],
    ["forma con letras", "{'descr': '<f4', 'fortran_order': False, 'shape': (a, b), }"],
  ])("rechaza un encabezado mal formado (%s)", (label, rawHeader) => {
    const array = buildNpy({ shape: [TABULAR_VALUES], rawHeader, rawData: Buffer.alloc(TABULAR_VALUES * 4) });

    expectRejected(buildNpz({ tabular: array }), "FIELD_CORRUPT", "tabular");
  });

  it("rechaza una firma de .npy incorrecta", () => {
    const array = buildNpy({ shape: [TABULAR_VALUES] });
    array[1] = 0x00;

    expectRejected(buildNpz({ tabular: array }), "FIELD_CORRUPT", "tabular");
  });

  it("rechaza un encabezado de .npy que declara un largo imposible", () => {
    const array = buildNpy({ shape: [TABULAR_VALUES] });
    array.writeUInt16LE(60000, 8);

    expectRejected(buildNpz({ tabular: array }), "FIELD_CORRUPT", "tabular");
  });

  it("los mensajes de rechazo no incluyen valores del archivo", () => {
    const secret = new Float32Array(WAVEFORM_VALUES).fill(123456.789);
    const bytes = buildNpz({ waveform: { shape: [2500, 11], values: secret } });

    expect(rejection(bytes).message).not.toMatch(/123456/);
  });
});
