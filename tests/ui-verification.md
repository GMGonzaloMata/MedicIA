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
- **Backend PDF:** requiere una ejecución aislada y autorizada que observe carga → visor → pedido explícito → resultado del modelo, y compruebe el rechazo desde otra clínica. No se infiere de los fixtures ni del listado estático de Playwright, que no ejecuta pruebas ni demuestra comportamiento en navegador.
