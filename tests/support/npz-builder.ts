import { crc32, deflateRawSync } from "node:zlib";

// Constructor de archivos `.npz` sintéticos para las pruebas. Escribe a mano un ZIP y entradas `.npy`
// (formato de NumPy) y permite falsear cada parte para armar los casos defectuosos. Nunca contiene
// datos reales: las ondas son senoidales y las variables, inventadas.

export const WAVEFORM_SHAPE: readonly number[] = [1, 2500, 12];
export const WAVEFORM_VALUES = 2500 * 12;
export const TABULAR_VALUES = 7;

export interface NpyOptions {
  // Tipo de NumPy: `<f4` y `<f8` son los admitidos; `|O` es un arreglo de objetos (`pickle`).
  descr?: string;
  fortranOrder?: boolean;
  shape: readonly number[];
  values?: ArrayLike<number>;
  // Reemplaza los bytes de datos tal cual (para formas que no coinciden con el encabezado).
  rawData?: Buffer;
  // Reemplaza todo el encabezado de texto (para encabezados mal formados).
  rawHeader?: string;
  version?: 1 | 2 | 3;
}

function itemSize(descr: string): number {
  return descr.endsWith("f8") ? 8 : 4;
}

export function buildNpy(options: NpyOptions): Buffer {
  const descr = options.descr ?? "<f4";
  const version = options.version ?? 1;
  const shapeText = options.shape.length === 1 ? `(${options.shape[0]},)` : `(${options.shape.join(", ")})`;
  const dict =
    options.rawHeader ??
    `{'descr': '${descr}', 'fortran_order': ${options.fortranOrder ? "True" : "False"}, 'shape': ${shapeText}, }`;

  const preamble = version === 1 ? 10 : 12;
  // El encabezado se rellena con espacios hasta un múltiplo de 64 y termina en salto de línea.
  const padded = dict + " ".repeat((64 - ((preamble + dict.length + 1) % 64)) % 64) + "\n";
  const header = Buffer.from(padded, version === 3 ? "utf8" : "latin1");

  const prefix = Buffer.alloc(preamble);
  prefix.write("\x93NUMPY", 0, "latin1");
  prefix[6] = version;
  prefix[7] = 0;
  if (version === 1) {
    prefix.writeUInt16LE(header.length, 8);
  } else {
    prefix.writeUInt32LE(header.length, 8);
  }

  let data: Buffer;
  if (options.rawData) {
    data = options.rawData;
  } else {
    const count = options.shape.reduce((product, size) => product * size, 1);
    const size = itemSize(descr);
    data = Buffer.alloc(count * size);
    for (let index = 0; index < count; index += 1) {
      const value = options.values?.[index] ?? 0;
      if (size === 8) {
        data.writeDoubleLE(value, index * 8);
      } else {
        data.writeFloatLE(value, index * 4);
      }
    }
  }

  return Buffer.concat([prefix, header, data]);
}

export interface ZipEntry {
  name: string;
  data: Buffer;
  // 0 almacenado, 8 deflate. Cualquier otro valor se escribe tal cual para probar el rechazo.
  method?: number;
  // Valores falsos para probar tamaños declarados que no coinciden con los reales.
  declaredUncompressedSize?: number;
  declaredCompressedSize?: number;
  crc?: number;
  flags?: number;
  // Nombre distinto en el encabezado local, para probar que debe coincidir con el del directorio central.
  localName?: string;
}

export interface ZipOptions {
  // Escribe los marcadores de ZIP64 en el registro final.
  zip64?: boolean;
  comment?: string;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

export function buildZip(entries: readonly ZipEntry[], options: ZipOptions = {}): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 0;
    const payload = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const name = Buffer.from(entry.name, "latin1");
    const localName = Buffer.from(entry.localName ?? entry.name, "latin1");
    const crc = entry.crc ?? crc32(entry.data);
    const compressedSize = entry.declaredCompressedSize ?? payload.length;
    const uncompressedSize = entry.declaredUncompressedSize ?? entry.data.length;
    const flags = entry.flags ?? 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(localName.length, 26);
    parts.push(local, localName, payload);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flags, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressedSize, 20);
    directory.writeUInt32LE(uncompressedSize, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);

    offset += local.length + localName.length + payload.length;
  }

  const centralBuffer = Buffer.concat(central);
  const comment = Buffer.from(options.comment ?? "", "latin1");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(options.zip64 ? 0xffff : entries.length, 8);
  end.writeUInt16LE(options.zip64 ? 0xffff : entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);

  return Buffer.concat([...parts, centralBuffer, end, comment]);
}

// Onda y variables sintéticas con la forma del conjunto de datos.
export function syntheticWaveform(): Float32Array {
  const values = new Float32Array(WAVEFORM_VALUES);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.fround(Math.sin(index / 31) * 2);
  }

  return values;
}

export function syntheticTabular(): Float32Array {
  return Float32Array.from([1, 0.35, -0.12, 0, 0.4, -0.2, 0.1]);
}

export interface NpzOptions {
  waveform?: NpyOptions | Buffer;
  tabular?: NpyOptions | Buffer;
  descr?: "<f4" | "<f8";
  compress?: boolean;
  // Entradas extra que el lector debe ignorar.
  extraEntries?: readonly ZipEntry[];
  zip?: ZipOptions;
}

function asBuffer(value: NpyOptions | Buffer): Buffer {
  return Buffer.isBuffer(value) ? value : buildNpy(value);
}

// Un `.npz` válido por defecto; cada opción reemplaza una parte para armar un defecto.
export function buildNpz(options: NpzOptions = {}): Buffer {
  const descr = options.descr ?? "<f4";
  const waveform = options.waveform ?? { descr, shape: WAVEFORM_SHAPE, values: syntheticWaveform() };
  const tabular = options.tabular ?? { descr, shape: [TABULAR_VALUES], values: syntheticTabular() };
  const method = options.compress ? 8 : 0;

  return buildZip(
    [
      { name: "waveform.npy", data: asBuffer(waveform), method },
      { name: "tabular.npy", data: asBuffer(tabular), method },
      ...(options.extraEntries ?? []),
    ],
    options.zip,
  );
}
