import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORIES = [
  "src/modules/studies/infrastructure/repositories/prisma-study-repository.ts",
  "src/modules/studies/infrastructure/repositories/prisma-patient-directory.ts",
  "src/modules/analyses/infrastructure/repositories/prisma-analysis-repository.ts",
];

// Cada consulta empieza en `prismaClient.<modelo>.` o `transaction.<modelo>.` / `$queryRaw`.
const QUERY_START = /(?:prismaClient|transaction)\.(?:(study|patient|studyCounter|analysis)\.\w+|\$queryRaw)/g;

// Excepción documentada en el puerto: la conciliación de archivos huérfanos busca por clave de almacenamiento
// (única en todo el sistema) y no expone datos de ningún estudio.
const ALLOWED_WITHOUT_TENANT = /storageKey:\s*\{\s*in:/;

function queryBlocks(source: string): string[] {
  const starts = [...source.matchAll(QUERY_START)].map((match) => match.index ?? 0);

  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length));
}

describe("las consultas de estudios, pacientes y análisis siempre incluyen la clínica", () => {
  it.each(REPOSITORIES)("%s", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    const blocks = queryBlocks(source);

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      if (ALLOWED_WITHOUT_TENANT.test(block)) {
        continue;
      }
      // Una consulta puede usar un `where` armado antes; ese `where` debe incluir la clínica.
      const usesSharedWhere = /\bwhere\b(?!:)/.test(block) && /const where = \{[^}]*tenantId/.test(source);

      expect(usesSharedWhere || /tenantId|tenant_id/.test(block), block.split("\n")[0]).toBe(true);
    }
  });

  it("ninguna consulta busca un estudio solo por su id", () => {
    const source = readFileSync(join(process.cwd(), REPOSITORIES[0] as string), "utf8");

    expect(source).not.toMatch(/findUnique\(\{\s*where:\s*\{\s*id/);
    expect(source).not.toMatch(/delete\(\{\s*where:\s*\{\s*id/);
  });
});
