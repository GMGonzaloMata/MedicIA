# Verify the isolated UI worktree without erasing demo data

Use the opt-in test profile below from `Trabajo-lucho-dark-rebrand`. It validates the dedicated `127.0.0.1:55433/medicia_test` target before running commands. Never run destructive integration tests against `medicia_demo`.

## Run the quality check and E2E

Prerequisites: the human has applied the existing migrations, configured the main checkout's private TEST connection, and prepared the browser. This invocation uses native Node TypeScript support and `--env-file`; the explicit entrypoint validates TEST before delegating to `--run`. Do not combine a preload hook with `--run` and assume the hook executes. The interaction was tested synthetically; the verification host uses Node 26.13.0. Do not paste connection strings into commands or reports.

```powershell
& {
    $previousMode = $env:MEDICIA_ISOLATED_UI_TESTS
    try {
        $env:MEDICIA_ISOLATED_UI_TESTS = '1'
        node --env-file=../Trabajo-lucho/.env.local ./tests/support/ui-test-environment.mts check
        if ($LASTEXITCODE -ne 0) { throw 'Quality check failed; stop before E2E.' }
        node --env-file=../Trabajo-lucho/.env.local ./tests/support/ui-test-environment.mts test:e2e
        if ($LASTEXITCODE -ne 0) { throw 'E2E failed; inspect the sanitized report.' }
    }
    finally {
        if ($null -eq $previousMode) { Remove-Item Env:MEDICIA_ISOLATED_UI_TESTS -ErrorAction SilentlyContinue }
        else { $env:MEDICIA_ISOLATED_UI_TESTS = $previousMode }
    }
}
```

The env-file path is specific to these sibling worktrees. Replace it with your human-managed TEST configuration when using another layout; never select the UI worktree's DEMO configuration. An already-set `DATABASE_URL` takes precedence over Node's file loader: an unexpected target is rejected rather than silently replaced.

## What is isolated

| Surface | Opt-in behavior |
| --- | --- |
| Database | Preload rejects any target except the owned loopback port/database, including URL routing overrides. Failure exits 2 without printing the URL. |
| Vitest/Playwright | Skip their explicit `.env.local` loader; use the validated process connection. |
| Next.js | Native startup loader supplies TEST before type generation/build. Next may still load its normal project environment internally; existing process values take precedence. |
| E2E server | Build/start on `127.0.0.1:3100`; never reuse another server. Existing simulated adapters and all auth/business behavior remain unchanged. |
| Without opt-in | Previous loader, port 3000, commands and reuse behavior are retained. This legacy mode is **not** suitable for the UI DEMO configuration. |

Do not run a development server on 3100 concurrently with E2E, or move/delete `.next` while a server is running. E2E and live `next-dev-loop` verification are separate checks; the latter also requires agent-browser >=0.31.1, Turbopack and a live `/_next/mcp`. Passing `check` alone is not visual, E2E, AWS or clinical validation.
