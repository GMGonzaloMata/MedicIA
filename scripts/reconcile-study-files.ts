// Concilia los archivos de estudios con la base: encuentra los objetos de `studies/` sin estudio (los que quedan si
// la aplicación guarda el archivo y falla antes de registrar el estudio, y tampoco puede borrarlo).
//
// Por defecto solo informa. Con `--apply` borra los huérfanos. `--min-age <minutos>` (por defecto 60) deja
// afuera los objetos recientes, que pueden estar guardándose en este momento.
//
// Uso:
//   npm run studies:reconcile
//   npm run studies:reconcile -- --apply --min-age 0
//
// Solo corre contra S3 si `STUDY_STORAGE=s3` está definido explícitamente, y usa la clave de la aplicación.

import { S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

import { createReconcileStudyFiles } from "../src/modules/studies/application/use-cases/reconcile-study-files.ts";
import { createS3StudyFileStorage } from "../src/modules/studies/infrastructure/adapters/s3-study-file-storage.ts";

const DEFAULT_MIN_AGE_MINUTES = 60;

export interface ReconcileOptions {
  apply: boolean;
  minAgeMinutes: number;
}

export function parseArguments(argv: string[]): ReconcileOptions {
  let apply = false;
  let minAgeMinutes = DEFAULT_MIN_AGE_MINUTES;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--min-age") {
      const value = Number(argv[index + 1]);

      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--min-age necesita un número de minutos mayor o igual que 0.");
      }
      minAgeMinutes = value;
      index += 1;
    } else {
      throw new Error(`Argumento desconocido: ${argument}. Usá --apply y --min-age <minutos>.`);
    }
  }

  return { apply, minAgeMinutes };
}

function requireVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));

  if (process.env.STUDY_STORAGE !== "s3") {
    throw new Error('Este script solo corre contra S3: definí STUDY_STORAGE="s3" de forma explícita.');
  }

  const bucket = requireVariable("STUDIES_BUCKET");
  const client = new S3Client({ region: requireVariable("AWS_REGION") });
  const database = new pg.Client({ connectionString: requireVariable("DATABASE_URL") });
  await database.connect();

  try {
    const reconcile = createReconcileStudyFiles({
      storage: createS3StudyFileStorage({ client, bucket }),
      now: () => new Date(),
      studies: {
        async findExistingStorageKeys(storageKeys) {
          const result = await database.query<{ storageKey: string }>(
            'SELECT storage_key AS "storageKey" FROM studies WHERE storage_key = ANY($1::text[])',
            [storageKeys],
          );

          return new Set(result.rows.map((row) => row.storageKey));
        },
      },
    });

    const result = await reconcile(options);

    console.log(`Objetos revisados: ${result.scanned}`);
    console.log(`Huérfanos (sin estudio y con más de ${options.minAgeMinutes} minutos): ${result.orphans.length}`);
    for (const key of result.orphans) {
      console.log(`  ${key}`);
    }
    console.log(options.apply ? `Borrados: ${result.deleted}` : "No se borró nada. Usá --apply para borrar los huérfanos.");
  } finally {
    await database.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Error desconocido.");
    process.exitCode = 1;
  });
}
