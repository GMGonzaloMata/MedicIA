# Checkpoint: real PDF → E022 → visible result with rebranding
Updated 2026-11-16 after explicit shutdown request. This supersedes the earlier checkpoint's current-state section; historical evidence remains in `pdf-unified-report.md`.

## STOP — do not resume automatically
Human: "necesito que busques un checkpoint nuuevamente y parar el trabajo ahi porque tengo que apagar la PC".
- Runtime worker `mwjti5fa-y-mw3r` cancelled successfully. All other children terminal; no active child at shutdown check.
- Jobs 1–8 terminal. Job 9 gracefully stopped ONLY the newly created synthetic PostgreSQL container after checking its owner label; exit 0, Docker state `exited`. `--time` emitted a deprecation warning; use `--timeout` in future.
- No further tests, implementation, Docker starts, migrations or publication until the human explicitly resumes.
- No commits, pushes, merges, cleanup or volume deletion. Files and failed evidence preserved.

## Goal and scope
First usable delivery: supported Mortara PDF upload → real extraction → explicit E022 analysis → visible progress/error/result using existing rebranding. Additional EchoNext work deferred, legacy NPZ preserved. No numeric FEVI estimate, threshold invention, averaged score, diagnostic claim or simulated inference presented as real.
- Target: `C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho-pdf-ecg`, branch `feature/pdf-ecg-ingestion`; original baseline `71df097ead0f7ca82486d037def47cfaba678ee9`.
- Read-only rebrand source: registered `C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho-dark-rebrand`. Source untouched; necessary visual changes incorporated into PDF target.
- S15 explicitly authorized local dependencies, NEW exclusive Docker model/reader/synthetic-DB resources and normal app/browser checks. No existing DB access, private env reads, patient PDFs, publication or agent-run Prisma commands.
- Prisma generation/migration/db commands remain HUMAN-only. Human already generated the correct PDF client (7.10.1); no migrations applied.

## Implemented and previously checked
- Domain/report policy, PDF codec, authorized upload/raw reader, mask-aware viewer and real dropzone.
- Integrated repository claim/component transitions/CAS/expiry: historical 45 focal, 198 preservation, 18 differential scenarios; real generated Prisma types and lint passed. Static review found no new demonstrated defect. SQL integration NOT executed.
- Integrated request/raw-reader/composition: historical 54 focal; 103 preservation INCLUDING those 54; real types/compositions and lint passed. 17 differential scenarios used reconstructed baseline, not independent checkout. Static review found no new demonstrated defect.
- UI candidate: rebrand sidebar/layout/tokens, explicit request, Next `after(run)`, scoped expiry/read, polling and unified-result panel. Historical 44 focal, 124 UI preservation, 67 application tests passed. Types were PROVISIONAL factory/route declarations; not assembled-app proof.
- Parent corrected stale disabled-PDF notice in `study-messages.ts` and its form test. RED 1 fail/8 pass; GREEN 9 pass; 124 UI preservation, scoped lint and whitespace checks exit 0. Field key `pdfNotEnabled` retained to avoid unrelated interface changes; value now describes save → study → explicitly request E022.
- NEW page differential failed before collection (cached baseline import unresolved), exit 1. No observed comparison, no retry. Earlier form differential and experimental T7 runtime failures remain failed/exhausted, not reopened.

## Interrupted runtime unit — do not treat as completed
Worker `mwjti5fa-y-mw3r` was cancelled after writing these candidates:
- `src/modules/studies/infrastructure/adapters/create-configured-pdf-extraction.ts`
- `src/modules/analyses/infrastructure/adapters/create-raw-ecg-inference.ts`
- `src/modules/analyses/infrastructure/adapters/http-raw-ecg-inference.ts`
- Their new tests under `tests/unit/modules/{studies,analyses}/infrastructure/`.
- `runtime/pdf-e022/{Dockerfile,extractor.py,requirements.txt,smoke.py,synthetic_pdf.py,test_extractor.py,verify_model.py}`.
- `scripts/pdf-e022-local/{prepare-source.mjs,runtime.ps1}`.
- Cache `node_modules/.cache/medicia-pdf-e022-runtime/`: `context/`, source manifest, RED logs, `green.log`, coverage and Vitest config. No final handoff/final candidate certification.
Observed saved `green.log`: 137 tests / 3 files pass, 100% lines, 95.23% branches. This is historical log evidence ONLY: no final exit sidecar/candidate-hash linkage or assembled types/lint/Python/Docker proof established by parent. Resume must reconcile actual files/logs before any checks or fixes, retaining correction budget and prior failures.

## Open architectural finding — still present at stop
UI static reviewer `mwjtmqoe-z-9cll` identified direct infrastructure-factory imports plus `no-restricted-imports` suppressions in upload/request actions. This violates project composition boundaries.
- Parent approved moving configured factory resolution into existing studies/analyses composition roots while actions keep authentication, validation, error translation, redirect and after scheduling.
- Runtime worker received expanded exact edit surfaces: both compositions, both actions, integrated-action test and report-presentation contract. No active competing writer remained.
- Shutdown grep confirms BOTH direct infrastructure imports/suppressions still present. Fix NOT completed. Prior UI used one post-GREEN correction; the remaining correction was assigned to this finding, not a reset of exhausted historical gates.
- Do not accept the documented exception as architectural approval. Preserve lazy service resolution after authentication and explicit unavailable behavior.

## Local dependencies and synthetic DB
- Installed locally with `npm install --ignore-scripts --no-audit --no-fund --no-save`: job 7 exit 0, 612 packages. Package/lock diff empty; Next/SWC helpers resolve locally; client and evidence paths retained. ESLint deprecation warning, no upgrade attempted.
- NEW container: `medicia-pdf-e022-local-01a1e570-db`.
- Container ID: `6a3f09268c4880fb91042273e8bfac3de936c6893eb43ed4a57597fb528eafb7`.
- NEW retained volume: `medicia-pdf-e022-local-01a1e570-db-data`.
- DB: `medicia_pdf_e022_synthetic`, user `medicia_local`, binding `127.0.0.1:5434` → 5432.
- Image: `postgres:17-alpine`, recorded digest `postgres@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac`.
- State at shutdown: **STOPPED/exited**, volume retained, migrations NOT applied.
- Parent-created `.env.local` contains only new synthetic DATABASE_URL plus explicit `IDENTITY_PROVIDER=fake` / `STUDY_STORAGE=fake`. Credential deliberately not copied into checkpoint/memory/output. No pre-existing env file was read/overwritten. No legacy AWS/model configuration supplied; E022 uses the new independent adapter.
- Preparation: `node_modules/.cache/medicia-pdf-local-db/prepare.mjs`; evidence `created.json`. Do NOT rerun preparation: it refuses existing resources/config.
- Job 8 exit 0 and internal-socket `pg_isready` success are NOT host authentication/schema/app proof. No Next app/server or real model started by parent.

### DB setup reviewer concerns — retain on resume
Verifier `mwjtw7mg-11-7bc5` was already completed when cancellation was attempted; no ongoing reviewer remained.
1. Existence checks used unformatted container inspect, which could read environment values on a future collision; restrict to ID metadata before any reuse of helper. No collision/private read demonstrated in this successful fresh run.
2. Volume check/create is not atomic: concurrent identical-name creation could reuse another volume. Need exclusive preparation/ownership verification, not automatic rerun.
3. Docker context locality not proven; loopback is on daemon host. Verify context metadata before restart/runtime proof, without secrets.
4. `pg_isready` used internal socket and may see transient init server; prove final server, host TCP/password and exact synthetic DB separately after authorized resume.
5. Per-Docker-call timeout absent; overall readiness deadline does not bound hung subprocess. No recovery or helper changes performed after STOP.

## Real model/reader evidence and resources
- Exact supplied ZIP: `C:/Users/lucho/Downloads/E022 - Paquete SageMaker piloto tecnico-20261116T143639Z-1-001.zip` (authorized source).
- Inner code ZIP 11836 bytes, SHA256 `f3762fc9a0765bb7a12058792d1b8e67b71941bd4c14b2d3703280074cd9fd74` verified before copying eight text members to ignored `node_modules/.cache/medicia-e022-source-inspection/`.
- Model TAR 344096102 bytes, SHA256 `a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96` (prior package verification). Loaded historical image ID `sha256:9871d08b243d17ae399a290751e67ec22ec5250118a6fccba132d1acaf338aa4`.
- Old failed importer/volume `medicia-e022-01a1e4b0-import` / `medicia-e022-01a1e4b0-model` untouched; never reuse/clean automatically. Failure was path transport, not inference. New runtime must use exclusive owned resources.
- Model `/invocations` expects `{waveform_uv, observed, tabular}` (12×5000 uV/mask, six tabular fields), 2 MiB max; model code performs normalization/imputation. Reply scored/e022-combined/lvef_lte_45/score/research_only, no version. Bind version to verified artifact provenance; don't invent one.
- Reader source public/pinned: `https://github.com/luchoaquinopla/Anonimizacion.git`, commit `4ff99ce97a42ff32a47268996f3cedcdabe70c1c`. Parser + PyMuPDF trace/text extraction. No original PDF to model endpoint; wrapper emits whitelisted app extraction contract, not entire parsed identity/document.
- Public tests provide invented text and vector waveform fixtures separately; combined synthetic-PDF-to-model acceptance remains unproved. Host Python executable absent; .NET ZIP inspection worked. Do not run supplied `check_local.py` (private paths/cleanup).

## Resume order after explicit human approval
1. Recover canonical ODD + this checkpoint + new file-hash snapshot; confirm cancelled child has no active successor. Reconcile partial runtime source/logs and budgets, not broad rediscovery or repetition of previous failures.
2. Complete scoped composition-boundary correction and runtime unit with actual types/lint/required tests. Review scripts before Docker/model execution; don't rerun existing-resource creation.
3. Verify Docker locality and retained DB ownership/state; start ONLY retained synthetic DB with explicit resumed authority. Prove host connection/auth to exact synthetic DB. Human then applies migrations from PDF worktree, ensuring no inherited DATABASE_URL redirects to another DB. No migration command has been issued/executed at this checkpoint.
4. Existing `seed-demo-clinic.ts` can create synthetic DB relationships AFTER migrations; inspect before running. Register/confirm (`000000` for explicit local fake identity)/sign in through actual app public workflows in the same app process. Seed does not create passwords. Identity/storage may be explicit local-test doubles; E022 must be REAL and identified as such.
5. Prepare/run real reader/E022 with new exclusive resources and synthetic input; normal Next app with real dependencies, not abandoned T7 launcher. Preserve patient privacy and all guards.
6. Run required assembled checks, SQL/tenant integration in exclusive DB, E2E and browser proof of upload → E022 → report with rebrand. Report actual failures; don't claim pending/failed differential or generic static reviews as proof.

## Evidence locations
Canonical task/spec: `odd/tasks/pdf-unified-report.md`, `specs/010-pdf-unified-report/`.
Snapshot: `odd/tasks/pdf-unified-report-checkpoint-files.json` (generated at stop, not an approval).
Caches: `medicia-pdf-{persistence,transitions,request,visible,e022-runtime,local-db}` under `node_modules/.cache/`.
Engram topic observation 3955 exceeded maximum size on a prior mirror update; canonical disk document has newer logs. Compact checkpoint/session summary must be used for resumption, not stale memory alone.
