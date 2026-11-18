# Local infrastructure closure
Bounded continuation on feature/EC2-RDS, based on HEAD 1179ecf6d6ffbef13c893d5c20d947d191a3f48d.
Existing Spec Kit 009 remains authoritative; this delta does not close live TLS, IAM or AWS acceptance.

## Specs
S1. "okey lanza multiples agentes para cerrar los pendiente locales y asi poder avanzar con eso"
S2. "no quiero que demos demasiadas vueltas, necesitamos ser precisos y avanzzar con esto"
S3. "okey hagamos eso" — acceptance of the exact bounded proposal quoted in L3.

S4. "el objetivo ahora es subir los servicios de RDS y EC2 a aws y empezar a trabajar y pulir el rebranding"
S5. "segui con lo que estabamos, lanza multiples agentes en paralelo par terminar esto"

## Tasks
T1 [done] S1–S3 — Reject ambiguous duplicated TLS URL parameters; public runtime regression RED/GREEN; parent inline; commit: human-only.
T2 [blocked: needs human authorization for a new adequately sized isolated test environment after the bounded preparation correction failed] S1–S3 — Execute the two existing Linux-only packaging cases in one isolated authorized container; no real release claim; route: bounded diagnostic executor; commit: not applicable.
T3 [blocked: static review complete; dynamic independent verification requires an admissible isolation policy] S1–S3 — Independent TLS review, at most one correction round; route: gentle-ai-verify, Risk: item 2 (TLS validation), item 5 (bootstrap); commit: human-only.
T4 [done] S1–S3 — Record exact evidence and outstanding integration/quality gates; parent; commit: human-only.

T5 [done] S4–S5 — Prepare an actionable EC2/RDS operator handoff from existing configuration, separating provisioning from app/model acceptance; route: bounded worker (context backstop); commit: human-only.
T6 [done] S4–S5 — Map current rebranding worktree and select concrete, bounded visible polish work without redesigning or editing yet; route: read-only explorer; commit: not applicable.

## Log
L1. User: "okey lanza multiples agentes para cerrar los pendiente locales y asi poder avanzar con eso"
L2. User: "no quiero que demos demasiadas vueltas, necesitamos ser precisos y avanzzar con esto"
L3. Accepted proposal: "¿Autorizás modificar únicamente ese validador y sus pruebas, y crear un contenedor Linux aislado para ejecutar las pruebas pendientes, sin secretos, datos, AWS ni tocar los servicios actuales?" / "Yo haría la corrección y las pruebas focales; después, una revisión independiente del cambio TLS, con una ronda de corrección como máximo. Eso no incluiría publicar ni aplicar Terraform."
L4. User: "okey hagamos eso"
L5. Source change authorized only in infra/modules/demo-host/templates/runtime.sh.tftpl and tests/unit/infra/demo-runtime.test.ts. Preserve Prisma, IAM, other protected templates, existing Docker services/data and all prior evidence. Prior C1/package/composition cycles are not reset. New Linux execution covers the two existing skipped cases, not bootstrap or a real release.
L6. Initial reviews: IAM/composition source had no new defect; independent execution unavailable due scratch-policy conflict. Preservation current25/25, protected13/13 and IAM7/7 passed. Historical renewal116/116 includes8 cases; tests differ from historic baseline only by NODE_ENV fixture addition. Linux cases unavailable on Windows. TLS source map: first sslmode accepted by validator versus last value used by pg-connection-string.
L7. Baseline unrelated changes: eslint.config.mjs, odd/tasks/global-quality.md, odd/tasks/local-postgres-quality.md; preserve. Do not run global check/DB/E2E using retained demo data or load .env.local. No commits, publication, real plan, AWS/backend/state access, migrations, generate or local dependency installation.
L8. T1 regression observed: RED job38 exit1 with four newly added duplicate-query cases accepted incorrectly; GREEN job39 exit0, 71/71 runtime+DNS/proxy tests. Fix adds exactly-one guards for sslmode/sslrootcert, retaining existing exact values. Logs under node_modules/.cache/medicia-local-tls-01a1e570/{red,green}. Scoped lint pending. T2 explorer had no execution tools and made no changes; parent executes the expressly authorized isolated container in job40, no authority bypass or retry of tests.
L9. Scoped lint exit0 and git diff --check exit0 (CRLF warnings only). T3 independent static reviewer mwkvod8l-10-p4j6 found no introduced defect; own dynamic execution UNAVAILABLE due mandatory full-workspace scratch versus privacy boundaries. No optional probes added, no source correction requested. Historical/native IAM authority untouched.
L10. Linux job40 created exactly one dedicated nonprivileged read-only-root container 21715cbf8b8f74675b9e1ad8f46af02c28b44bfa996cb989c535fdbf57329246, Node image sha256:5ba3c1ded6eada2ea16582327a87c672fb3889fca362ee3ac0d78ed742b583c0. uname Linux x86_64 / Node v24.22.3. Test execution network detached, but Vitest startup failed before running any test: missing declared @rolldown/binding-linux-x64-gnu@1.2.19. One bounded preparation correction in samecontainer job41 failed npm exit228 ENOSPC. No Linux test verdict, no package source changes. Both failure logs retained in node_modules/.cache/medicia-local-tls-01a1e570/linux-335d03b8-a65d-44c0-b506-39e803c261cd/. No further recovery authorized within this cycle.
L11. New container disconnected from bridge after failure; attempted package-lock retention failed because /work/package-lock.json was absent (no lock evidence claimed). Subsequent exact-owned-ID stop exit0; container retained stopped, image retained. No existing services/data changed. Only copied public allowlisted inputs (package test, producer script, runtime template), no secrets; dependency installation was container-only. No cleanup of old resources or host dependencies.

L12. Final scoped diff check exit0: runtime+2 lines, tests+17, quickstart one bullet replacement; no commits. Documentation records current duplicate-guard fix without closing live TLS/other overrides/T018. Global npm run check/coverage/E2E not run because no authorized disposable app DB/schema and no private-environment access. No user-view code changed. Final bounded outcome NEEDS HUMAN DECISION: Linux preparation correction exhausted (0 tests executed), independent dynamic verification unavailable. No active agent/job remains for this delta; new owned container stopped, no automatic further tests or recovery. Risk: item 2 (TLS security guard), item 5 (runtime/bootstrap).

L13. USER EXPLICIT STOP: "busca un checkpoint y despues seguimos porque necesito apagar la pc". Save checkpoint and pause; no further implementation, tests, containers, service operations or publication until human resumes. Git checkpoint remains HEAD1179ecf6d6ffbef13c893d5c20d947d191a3f48d; this delta is saved uncommitted, not remotely backed up. Proposed new Linux environment has NOT been authorized.

L14. User: "el objetivo ahora es subir los servicios de RDS y EC2 a aws y empezar a trabajar y pulir el rebranding"
L15. User: "segui con lo que estabamos, lanza multiples agentes en paralelo par terminar esto". Explicit resume for infrastructure handoff and rebranding prioritization. Does not authorize AWS/publishing, frozen IAM edits, private reads or exhausted Linux/preparation retries. TLS fix remains present. Rebranding worktree currently feature/stitch-dark-rebrand at43b55d2; examine current state before proposing edits. Provisioning must not be claimed decoupled from runtime prerequisites without checking existing code.

L16. T5 worker mwkye5zb-1-6jy0 completed odd/tasks/ec2-rds-handoff.md (94 lines); structural checks exit0,20 local links/18 runbook commands verified. New-file diff-check exit1 due file difference, no whitespace diagnostics; not represented as exit0. Parent read full handoff. Actual code couples demo.enabled to real AMI/release references and automatic app startup. No clean infrastructure-only mode exists. Models need not be live to plan, but creating EC2 attempts secret/release retrieval and web startup. Decision required: retain coupled flow with real prerequisites/recovery, or explicitly authorize a separate provision-only activation gate. No implementation of such gate authorized by this doc. Rebranding worker mwkyk94z-3-9oa9 continues independently.
