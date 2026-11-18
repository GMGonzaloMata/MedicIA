# Verify the isolated UI worktree without erasing demo data

Use the opt-in test profile below from the integration worktree. It validates the dedicated `127.0.0.1:15433/medicia_test` target before running commands. Never run destructive integration tests against `medicia_demo`.

## Run the quality check and E2E

Prerequisites: the project owner has migrated the dedicated disposable database on port 15433 and prepared Chromium. From the integration worktree, start a PowerShell session configured with the dedicated TEST connection in DATABASE_URL. Do not use the demo configuration or print connection strings. No sibling checkout or environment file is required.

```powershell
& {
    if (-not $env:DATABASE_URL) { throw 'Configure the dedicated TEST connection first.' }
    $previousMode = $env:MEDICIA_ISOLATED_UI_TESTS
    try {
        $env:MEDICIA_ISOLATED_UI_TESTS = '1'
        node ./tests/support/ui-test-environment.mts check
        if ($LASTEXITCODE -ne 0) { throw 'Quality check failed; stop before E2E.' }
        node ./tests/support/ui-test-environment.mts test:e2e
        if ($LASTEXITCODE -ne 0) { throw 'E2E failed; inspect the sanitized report.' }
    }
    finally { $env:MEDICIA_ISOLATED_UI_TESTS = $previousMode }
}
```

The explicit entrypoint validates the inherited TEST connection before delegating. Never run integration tests against a database that contains data you need to keep.

## What is isolated

| Surface | Opt-in behavior |
| --- | --- |
| Database | Preload rejects any target except the owned loopback port/database, including URL routing overrides. Failure exits 2 without printing the URL. |
| Vitest/Playwright | Skip their explicit `.env.local` loader; use the validated process connection. |
| Next.js | Native startup loader supplies TEST before type generation/build. Next may still load its normal project environment internally; existing process values take precedence. |
| E2E server | Build/start on `127.0.0.1:3100`; never reuse another server. Existing simulated adapters and all auth/business behavior remain unchanged. |
| Without opt-in | Previous loader, port 3000, commands and reuse behavior are retained. This legacy mode is **not** suitable for the UI DEMO configuration. |

Do not run a development server on 3100 concurrently with E2E, or move/delete `.next` while a server is running. E2E and live `next-dev-loop` verification are separate checks; the latter also requires agent-browser >=0.31.1, Turbopack and a live `/_next/mcp`. Passing `check` alone is not visual, E2E, AWS or clinical validation.

## Qué evidencia da cada prueba de ECG

- **NPZ (compatibilidad):** los E2E eligen explícitamente «NPZ (compatibilidad)» y «Electrocardiograma (ECG)». Usan un NPZ sintético, la acción de carga y la base TEST; el almacenamiento y el modelo legacy son simulados. Los estudios que se siembran sin archivo solo comprueban el escenario que declara cada prueba.
- **Selector PDF:** `tests/e2e/study-pdf-picker.spec.ts` usa el formulario autenticado del paciente, con una cuenta sintética. Comprueba apertura por teclado, foco visible, nombre y tamaño, reflujo, retiro, rechazo y cambio de formato. El archivo sintético nunca se envía: esto no prueba extracción Mortara, guardado, visor, modelo ni aislamiento entre clínicas para PDF. Los éxitos simulados en Vitest tampoco son prueba del backend.
- **Movimiento en el ingreso:** `tests/e2e/sign-in-motion.spec.ts` comprueba que el ECG decorativo queda estático con movimiento reducido y conserva su animación de 18 s con la preferencia predeterminada.
- **Backend PDF con E022:** el perfil de aceptación optativo de abajo comprueba carga → visor → pedido explícito → resultado persistido y rechazo desde otra clínica. El listado estático de Playwright no ejecuta esa prueba ni demuestra comportamiento en navegador.

## Aceptación optativa: PDF sintético → E022 local

El responsable ejecuta este perfil solo en el worktree de integración y no en la demo. Antes de correrlo:

1. Verificá la identidad y el esquema migrado de la base TEST descartable `127.0.0.1:15433/medicia_test`. Configurá **solo** esa conexión en `DATABASE_URL`, sin imprimirla. No heredes variables `PG*`, proxies, flags de depuración de Playwright ni configuración de la demo.
2. Usá los servicios locales autorizados y verificados según [el runtime E022](../scripts/pdf-e022-local/README.md): lector `127.0.0.1:18081`, modelo `127.0.0.1:18080` y hashes de ambos artefactos verificados antes de declarar los pines de abajo. No se inicia Docker desde Playwright ni se usa un sustituto de lector o modelo. Reservá el puerto `3110` para este perfil.
3. Generá el PDF exclusivamente con `runtime/pdf-e022/synthetic_pdf.py` en el contenedor generador verificado. Capturá su salida base64 sin imprimirla y decodificala directamente al archivo fijo `node_modules/.cache/medicia-acceptance-e022/fixture.pdf` con creación exclusiva (`FileMode.CreateNew`); nunca sobrescribas un archivo existente ni elijas un PDF por ruta. Usá directorios reales dentro del worktree, sin enlaces/junctions. Pasá solo su SHA-256 verificado en minúsculas como `MEDICIA_E022_FIXTURE_SHA256`. El test abre solo el archivo fijo, valida el límite de 2 MiB, la firma PDF y el hash antes de crear datos de prueba. Un hash no prueba por sí solo que el documento sea sintético: su procedencia es responsabilidad de quien prepara el fixture.
4. Tené instalado Chromium en `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0`). El worktree no debe contener ninguno de `.env`, `.env.local`, `.env.development` o `.env.development.local`. El perfil los comprueba por metadatos y no abre ninguno; si existen, no uses ese worktree para esta corrida. No ejecutes otra instancia de Next sobre el mismo output de desarrollo durante la prueba.

En una sesión PowerShell dedicada, con `DATABASE_URL` y `MEDICIA_E022_FIXTURE_SHA256` ya provistos:

```powershell
$env:MEDICIA_ISOLATED_UI_TESTS = '1'
$env:PLAYWRIGHT_BROWSERS_PATH = '0'
$env:PDF_E022_LOCAL_SYNTHETIC = '1'
$env:PDF_EXTRACTION_ENDPOINT = 'http://127.0.0.1:18081/extract'
$env:E022_INFERENCE_ENDPOINT = 'http://127.0.0.1:18080/invocations'
$env:E022_MODEL_SHA256 = 'a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96'
$env:E022_PREPROCESSING_SHA256 = '243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9'
node ./node_modules/@playwright/test/cli.js test --config=playwright.e022-local.config.mts
if ($LASTEXITCODE -ne 0) { throw 'Falló la aceptación E022 local.' }
```

Podés agregar `--list` para comprobar solo la colección: debe listar una prueba desktop, sin levantar Next, abrir el fixture, conectar a la base ni llamar al lector/modelo. El perfil no se incluye en `npm run test:e2e`. La corrida real inicia `next dev` en `127.0.0.1:3110`, sin reutilizar servidores. Pasa a Next solo el entorno operativo mínimo y el TEST validado, sin configuración AWS, fallbacks de modelo, proxies ni opciones de Node heredadas; solo identidad y almacenamiento son simulados. Esta configuración no es un sandbox de red: el código de Next sigue usando el cargador de fuentes de la app. Las trazas, videos y capturas están desactivados; no publiques fixture, datos, credenciales ni salidas sin sanitizar. Reservá `node_modules/.cache/medicia-acceptance-e022/results` para los resultados desechables de Playwright, no para guardar el fixture ni evidencias que quieras conservar.

Una corrida verde comprueba que abrir el visor no crea análisis, que el pedido explícito publica progreso sin puntuación y luego un informe parcial con E022, la omisión Mini, la puntuación de investigación y las referencias fijadas. Comprueba que recargar conserva el mismo pedido y su puntuación sin crear otro análisis, y que la otra clínica no puede ver el estudio ni el informe ni acceder al botón de análisis; el conteo de ambas clínicas queda igual. El conteo verifica filas de análisis, no tráfico de inferencia: si se necesita certificar el número de llamadas HTTP, corroboralo en la evidencia sanitizada del runtime verificado. La prueba no valida precisión clínica, almacenamiento S3 ni rutas de la demo.
