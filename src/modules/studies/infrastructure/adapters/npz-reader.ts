import { crc32, inflateRawSync } from "node:zlib";

import { TABULAR_LENGTH, WAVEFORM_LEADS, WAVEFORM_SAMPLES, type EcgStudyData } from "../../domain/ecg-study";
import { StudyRejectedError, type StudyField } from "../../domain/study-errors";
import type { StudyFileReader } from "../../application/ports/out/study-file-reader";

// Lector propio y mínimo de `.npz` (specs/006-carga-estudios-ecg/research.md, R2). Un `.npz` es un ZIP con un
// `.npy` por arreglo. Se lee solo lo necesario, todo en memoria y con topes en cada paso:
// - nunca se evalúa ni se deserializa nada del archivo: el encabezado de `.npy` se analiza con una expresión
//   regular estricta y los arreglos de objetos (que NumPy guarda con `pickle`) se rechazan por su tipo;
// - nunca se escribe en disco, así que un nombre de entrada no puede apuntar a otra ruta;
// - cada entrada se descomprime con un tope exacto, para que un archivo que miente sobre su tamaño no pueda
//   agotar la memoria.
// Los mensajes de rechazo nombran el campo y la regla, nunca valores ni nombres que traiga el archivo.

export const MAX_NPZ_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
// Una onda de float64 pesa 240 KB: una entrada obligatoria más grande que esto no puede ser un arreglo válido.
const MAX_ENTRY_BYTES = 1024 * 1024;
const MAX_ENTRIES = 16;
const MAX_NPY_HEADER_BYTES = 4096;

const END_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_RECORD_BYTES = 22;
const ZIP64_LOCATOR_BYTES = 20;
const MAX_COMMENT_BYTES = 65535;
const CENTRAL_HEADER_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
const ENCRYPTED_FLAG = 0x1;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const WAVEFORM_ENTRY = "waveform.npy";
const TABULAR_ENTRY = "tabular.npy";
const REQUIRED_ENTRIES: ReadonlyArray<{ name: string; field: StudyField; shapes: readonly (readonly number[])[] }> = [
  {
    name: WAVEFORM_ENTRY,
    field: "waveform",
    // La forma del conjunto de datos (con la dimensión de canal) o la onda sola.
    shapes: [
      [1, WAVEFORM_SAMPLES, WAVEFORM_LEADS],
      [WAVEFORM_SAMPLES, WAVEFORM_LEADS],
    ],
  },
  { name: TABULAR_ENTRY, field: "tabular", shapes: [[TABULAR_LENGTH]] },
];

const NPY_MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);
const NPY_HEADER_PATTERN =
  /^\{'descr': '([^']*)', 'fortran_order': (True|False), 'shape': \(([0-9, ]*)\), \}$/;
const NPY_PRINTABLE = /^[\x20-\x7e]*\n?$/;
const NPY_TYPES = { "<f4": 4, "<f8": 8 } as const;

interface ZipEntry {
  name: string;
  nameBytes: Buffer;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function reject(code: ConstructorParameters<typeof StudyRejectedError>[0], field?: StudyField): never {
  throw new StudyRejectedError(code, field);
}

function findEndRecord(bytes: Buffer): number {
  const lowest = Math.max(0, bytes.length - END_RECORD_BYTES - MAX_COMMENT_BYTES);

  for (let offset = bytes.length - END_RECORD_BYTES; offset >= lowest; offset -= 1) {
    // El comentario del final tiene que cerrar justo en el último byte: sin ambigüedad sobre dónde termina.
    if (bytes.readUInt32LE(offset) === END_SIGNATURE && offset + END_RECORD_BYTES + bytes.readUInt16LE(offset + 20) === bytes.length) {
      return offset;
    }
  }

  return reject("NOT_NPZ");
}

function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.startsWith("/") || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return false;
  }

  return ![...name].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function readCentralDirectory(bytes: Buffer): { entries: ZipEntry[]; centralOffset: number } {
  if (bytes.length < END_RECORD_BYTES) {
    return reject("NOT_NPZ");
  }

  const end = findEndRecord(bytes);
  if (end >= ZIP64_LOCATOR_BYTES && bytes.readUInt32LE(end - ZIP64_LOCATOR_BYTES) === ZIP64_LOCATOR_SIGNATURE) {
    return reject("UNSUPPORTED_ZIP");
  }

  const diskNumber = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const entriesOnDisk = bytes.readUInt16LE(end + 8);
  const totalEntries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);

  const usesZip64 =
    totalEntries === ZIP64_MARKER_16 || centralSize === ZIP64_MARKER_32 || centralOffset === ZIP64_MARKER_32;
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries || usesZip64 || totalEntries > MAX_ENTRIES) {
    return reject("UNSUPPORTED_ZIP");
  }

  if (totalEntries === 0 || centralOffset + centralSize !== end) {
    return reject("NOT_NPZ");
  }

  const entries: ZipEntry[] = [];
  let position = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (position + CENTRAL_HEADER_BYTES > end || bytes.readUInt32LE(position) !== CENTRAL_SIGNATURE) {
      return reject("NOT_NPZ");
    }

    const nameLength = bytes.readUInt16LE(position + 28);
    const extraLength = bytes.readUInt16LE(position + 30);
    const commentLength = bytes.readUInt16LE(position + 32);
    const nameBytes = bytes.subarray(position + CENTRAL_HEADER_BYTES, position + CENTRAL_HEADER_BYTES + nameLength);
    const compressedSize = bytes.readUInt32LE(position + 20);
    const uncompressedSize = bytes.readUInt32LE(position + 24);
    const localOffset = bytes.readUInt32LE(position + 42);

    if (compressedSize === ZIP64_MARKER_32 || uncompressedSize === ZIP64_MARKER_32 || localOffset === ZIP64_MARKER_32) {
      return reject("UNSUPPORTED_ZIP");
    }

    entries.push({
      name: nameBytes.toString("latin1"),
      nameBytes,
      flags: bytes.readUInt16LE(position + 8),
      method: bytes.readUInt16LE(position + 10),
      crc: bytes.readUInt32LE(position + 16),
      compressedSize,
      uncompressedSize,
      localOffset,
    });

    position += CENTRAL_HEADER_BYTES + nameLength + extraLength + commentLength;
  }

  return { entries, centralOffset };
}

function checkEntries(entries: readonly ZipEntry[]): void {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!isSafeEntryName(entry.name)) {
      reject("UNSUPPORTED_ZIP");
    }

    if (seen.has(entry.name)) {
      const required = REQUIRED_ENTRIES.find(({ name }) => name === entry.name);
      return required ? reject("FIELD_DUPLICATED", required.field) : reject("UNSUPPORTED_ZIP");
    }

    seen.add(entry.name);
  }

  const declaredTotal = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (declaredTotal > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    reject("EXPANSION_LIMIT");
  }
}

function extractEntry(bytes: Buffer, entry: ZipEntry, centralOffset: number, field: StudyField): Buffer {
  if ((entry.flags & ENCRYPTED_FLAG) !== 0 || (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE)) {
    return reject("UNSUPPORTED_ZIP");
  }

  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    return reject("EXPANSION_LIMIT");
  }

  const local = entry.localOffset;
  if (local + LOCAL_HEADER_BYTES > centralOffset || bytes.readUInt32LE(local) !== LOCAL_SIGNATURE) {
    return reject("NOT_NPZ");
  }

  const nameLength = bytes.readUInt16LE(local + 26);
  const extraLength = bytes.readUInt16LE(local + 28);
  const localName = bytes.subarray(local + LOCAL_HEADER_BYTES, local + LOCAL_HEADER_BYTES + nameLength);
  if (!localName.equals(entry.nameBytes)) {
    return reject("NOT_NPZ");
  }

  const start = local + LOCAL_HEADER_BYTES + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > centralOffset) {
    return reject("NOT_NPZ");
  }

  const stored = bytes.subarray(start, end);
  let data: Buffer;

  if (entry.method === METHOD_STORED) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      return reject("FIELD_CORRUPT", field);
    }
    data = stored;
  } else {
    try {
      // El tope es exactamente lo que la entrada declara: si se expande más, se corta sin llenar la memoria.
      data = inflateRawSync(stored, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return reject(code === "ERR_BUFFER_TOO_LARGE" ? "EXPANSION_LIMIT" : "FIELD_CORRUPT", field);
    }
  }

  if (data.length !== entry.uncompressedSize || (crc32(data) >>> 0) !== entry.crc) {
    return reject("FIELD_CORRUPT", field);
  }

  return data;
}

function parseNpy(data: Buffer, field: StudyField, allowedShapes: readonly (readonly number[])[]): Float32Array {
  if (data.length < 10 || !data.subarray(0, NPY_MAGIC.length).equals(NPY_MAGIC)) {
    return reject("FIELD_CORRUPT", field);
  }

  const major = data[6] as number;
  if (major < 1 || major > 3) {
    return reject("FIELD_CORRUPT", field);
  }

  const headerStart = major === 1 ? 10 : 12;
  const headerLength = major === 1 ? data.readUInt16LE(8) : data.readUInt32LE(8);
  const dataStart = headerStart + headerLength;
  if (headerLength > MAX_NPY_HEADER_BYTES || dataStart > data.length) {
    return reject("FIELD_CORRUPT", field);
  }

  const headerText = data.toString(major === 3 ? "utf8" : "latin1", headerStart, dataStart);
  if (!NPY_PRINTABLE.test(headerText)) {
    return reject("FIELD_CORRUPT", field);
  }

  const match = NPY_HEADER_PATTERN.exec(headerText.trimEnd());
  if (!match) {
    return reject("FIELD_CORRUPT", field);
  }

  const [, descr, fortranOrder, shapeText] = match as unknown as [string, string, string, string];
  // Un arreglo de objetos (`|O`) o de otro tipo se rechaza sin leer sus datos.
  const itemSize = NPY_TYPES[descr as keyof typeof NPY_TYPES];
  if (itemSize === undefined) {
    return reject("FIELD_TYPE", field);
  }

  if (fortranOrder === "True") {
    return reject("FIELD_CORRUPT", field);
  }

  const shape = shapeText
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map(Number);
  if (!allowedShapes.some((allowed) => allowed.length === shape.length && allowed.every((size, index) => size === shape[index]))) {
    return reject("FIELD_SHAPE", field);
  }

  const count = shape.reduce((product, size) => product * size, 1);
  if (data.length !== dataStart + count * itemSize) {
    return reject("FIELD_CORRUPT", field);
  }

  const view = new DataView(data.buffer, data.byteOffset + dataStart, count * itemSize);
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = itemSize === 4 ? view.getFloat32(index * 4, true) : Math.fround(view.getFloat64(index * 8, true));
  }

  return values;
}

// Un valor de 8 bytes que no entra en `float32` pasa a infinito; las reglas de contenido lo rechazan después.
export function readNpz(input: Uint8Array): EcgStudyData {
  if (input.byteLength > MAX_NPZ_BYTES) {
    return reject("FILE_TOO_LARGE");
  }

  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  try {
    const { entries, centralOffset } = readCentralDirectory(bytes);
    checkEntries(entries);

    const arrays = REQUIRED_ENTRIES.map(({ name, field, shapes }) => {
      const entry = entries.find((candidate) => candidate.name === name);
      if (!entry) {
        return reject("FIELD_MISSING", field);
      }

      return parseNpy(extractEntry(bytes, entry, centralOffset, field), field, shapes);
    });

    return { waveform: arrays[0] as Float32Array, tabular: arrays[1] as Float32Array };
  } catch (error) {
    // Una lectura fuera de rango del búfer significa que el archivo está truncado o mal formado.
    if (error instanceof RangeError) {
      return reject("NOT_NPZ");
    }
    throw error;
  }
}

export function createNpzStudyFileReader(): StudyFileReader {
  return { read: readNpz };
}
