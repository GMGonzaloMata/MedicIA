# Checkpoint — local infrastructure closure

> Historical checkpoint: the human subsequently resumed and authorized explicit app activation. Current source/evidence/limits are in `odd/tasks/ec2-rds-activation.md` and `odd/tasks/ec2-rds-handoff.md` (Engram3970). Rebranding navigation implementation/checks are recorded in the separate rebranding worktree's `odd/tasks/rebranding-navigation.md` (Engram3969). The historical Linux correction budget below is still exhausted.
Paused at the user's explicit request: "busca un checkpoint y despues seguimos porque necesito apagar la pc".
Resume only after an explicit human request. No running agent or background job from this delta.

## Workspace and saved work
- Root: C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho
- Branch: feature/EC2-RDS
- HEAD: 1179ecf6d6ffbef13c893d5c20d947d191a3f48d
- Saved **uncommitted**: infra/modules/demo-host/templates/runtime.sh.tftpl (+2), tests/unit/infra/demo-runtime.test.ts (+17), specs/009-ec2-rds-test/quickstart.md (TLS evidence bullet).
- Tracking: odd/tasks/local-infra-closure.md; Engram3966, bugfix3967.
- Preserve unrelated eslint.config.mjs, odd/tasks/global-quality.md, odd/tasks/local-postgres-quality.md.
- No commit, push, PR, merge, AWS or Prisma operation performed.

## Verified
- TLS validator now requires exactly one sslmode and sslrootcert, retaining verify-full and the fixed CA.
- RED: 67 passed / 4 failed; GREEN: 71/71 passed, exit0; scoped lint0 and diff check0.
- Independent static review favorable, no required correction. Independent dynamic execution unavailable due scratch/privacy-policy conflict; do not claim it passed.
- Evidence: node_modules/.cache/medicia-local-tls-01a1e570/{red,green,lint}.
- Prior read-only IAM/composition assessment found no new source defect; this is not approval to deploy.

## Linux blocker and retained resources
- Two existing Linux packaging tests have NOT executed.
- Job40 startup failed: missing @rolldown/binding-linux-x64-gnu@1.2.19. One preparation correction job41 failed npm exit228 ENOSPC. This bounded correction is exhausted; no silent retry or budget reset.
- Evidence: node_modules/.cache/medicia-local-tls-01a1e570/linux-335d03b8-a65d-44c0-b506-39e803c261cd/ (including binding-correction).
- New owned container 21715cbf8b8f74675b9e1ad8f46af02c28b44bfa996cb989c535fdbf57329246 disconnected and STOPPED, retained.
- Image sha256:5ba3c1ded6eada2ea16582327a87c672fb3889fca362ee3ac0d78ed742b583c0 retained. Observed Linux x86_64 / Node24.22.3.
- Failed package-lock copy: file absent; no lock evidence claimed.
- Do NOT rerun linux-cases.mjs or linux-binding-recovery.mjs blindly. New container with more space was proposed, NOT authorized.

## Resume
1. Read memory3966 and this checkpoint, reconcile Git and actual service state after shutdown.
2. Obtain explicit disposition for the proposed new isolated Linux environment; preserve old evidence and services. Same two packaging tests only, no real release claim.
3. Independent execution limitation remains separate. Global check/coverage and live DB TLS/CA/hostname/T018 remain unverified; never run destructive suites against retained demo DB.
4. No automatic restart of PDF/Next/DB/model services. Their previous process/container identities are historical, not proof they survive reboot.
5. Next fake auth/storage are process-memory-backed; shutdown loses that transient state. Do not claim patient PDF or login survives. Persistent volumes must not be removed/reseeded.
6. Separate PDF/rebranding worktrees remain untouched. Human UI PDF→E022 completion was observed; older todo notes claiming no login/inference are stale.
