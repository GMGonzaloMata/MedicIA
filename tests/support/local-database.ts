const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// Las pruebas de integración vacían las tablas, así que nunca deben correr contra una base
// que no sea la local de Docker. Este resguardo evita vaciar producción por error.
export function assertLocalDatabaseUrl(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. Copiá .env.example como .env.local y levantá la base con `docker compose up -d`.",
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL no es una URL válida.");
  }

  // El driver `pg` da prioridad al parámetro `host` de la URL sobre el host real, así que
  // una URL como `...@localhost/db?host=servidor-remoto` se conectaría al servidor remoto.
  if (url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new Error("DATABASE_URL no puede indicar el servidor con los parámetros host u hostaddr.");
  }

  const host = url.hostname;

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Las pruebas de integración vacían las tablas y solo corren contra una base local. DATABASE_URL apunta a "${host}".`,
    );
  }

  return connectionString;
}
