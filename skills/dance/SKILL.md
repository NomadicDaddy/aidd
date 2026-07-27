---
name: dance
description: 'Run The Dance across Spernakit and derived apps: ship the template, sync each app via three-way base comparison, test, remediate, verify, tag, and report with checkpointed resume. Use for The Dance, propagation, or a fleet-wide release.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: >-
        humanize-docs, spernakit-bump, template-upgrade, template-refactor,
        spernakit-diff-sync, spernakit-tester, bug2feature, feature-review, devdiary-update
---

# Propagate the Spernakit Fleet

Propagate the Spernakit template through its derived applications.

During development, it is completely normal to perform the dance often.

## Spernakit Registry

App metadata, ports, URLs, and current versions live in:

- `<spernakit-root>/spernakit.psd1`
- `<applications-root>/AGENTS.md` (canonical app list)

**Default scope**: all registered derived apps in `<spernakit-root>/spernakit.psd1`. Every
derived-app entry must have a concrete semantic `spernakit_version`; abort preflight when the
manifest is missing one or contains a non-semver value. `spernakit/spernakit.psd1` is authoritative;
do not hardcode app counts, lists, or individual app slugs elsewhere. `spernakit-lite` apps are out
of default scope; include only when explicitly passed via `--scope`.

## Arguments

| Arg                    | Default                              | Purpose                                                                                                                                                             |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$1` (bump-hint)       | auto-decide                          | `+0.0.1` or `+0.1.0`. If absent, the skill analyzes `git log` since last tag and decides without prompting.                                                         |
| `--scope <apps>`       | all pinned apps in `spernakit.psd1`  | CSV of derived apps to dance through (e.g., `--scope app-one,app-two`). `spernakit-lite` apps only included when named explicitly.                                  |
| `--pilot <app>`        | first pinned app in `spernakit.psd1` | App to run Part A on first; remaining apps fan out in parallel after pilot succeeds. Resolve the default from the manifest at run time rather than assuming a slug. |
| `--skip-parts <list>`  | none                                 | CSV of `A,B,C,D` to skip (escape hatch for partial reruns).                                                                                                         |
| `--resume-from <part>` | none                                 | Resume from checkpoint at Part A/B/C/D. Reads `<applications-root>/.dance-state.json`.                                                                              |
| `--dry-run`            | off                                  | Print intended actions, write no commits, run no supertests.                                                                                                        |

## Checkpoint Schema

The skill maintains state at `<applications-root>/.dance-state.json`. Schema documented in `state-schema.json` co-located with this SKILL.md. Always write the checkpoint after each phase transition so a crash mid-dance can resume cleanly.

## Phase 0 - Pre-flight

Run unconditionally on every invocation (even with `--resume-from`).

1. Load or initialize `<applications-root>/.dance-state.json`.
2. **Verify spernakit smoke:qc**: `cd <spernakit-root> && bun run smoke:qc`. Abort if red; never bump on a broken template.
3. **Bump-size auto-decide** (no user prompt):
    - Read previous tag: `git -C <spernakit-root> describe --tags --abbrev=0`.
    - Parse commits since: `git log v{prev}..HEAD --oneline`.
    - **Patch** (`+0.0.1`) if all commits match `fix:|docs:|deps:|chore:|style:|refactor(internal)`.
    - **Minor** (`+0.1.0`) if any commit adds a feature, route, schema column, plugin, or template-managed file (check `scripts/template-manifest.json` for additions).
    - Decision recorded in checkpoint and final session report. Never prompt the user.
4. **Verify scoped apps are clean**: for each app in scope, `git -C {APP_DIR} status --porcelain` must be empty. Abort if dirty.
5. **Rate-limiter precheck**: inspect each scoped app's active development configuration. For rapid
   multi-role login tests, require both `rateLimit.enabled` and `rateLimit.authEnabled` to be
   `false`. Prefer process-local overrides that are restored when testing ends. If the app does not
   support a reversible override, keep persistent configuration unchanged and run rate-aware tests.
6. **Pode core precheck** (any app whose stack is `spernakit+pode`): these apps require the Pode core backend to be running for dev/start and for tester traffic to succeed. `bun run dev` / `bun run start` in these apps is expected to launch core; verify the app's dev/start script does so (grep the script for a Pode launcher invocation). If the script does not start core, abort and surface the gap; do not proceed to tester without core — results gathered without core are not evidence of anything.
7. **Manifest validation** (spernakit + scoped apps):
    - For Spernakit: verify every entry in the `branded` and `infrastructure` arrays of
      `scripts/template-manifest.json` points to an existing `<spernakit-root>/{path}`. Repair stale
      entries before Part A1. Part A's automatic decision catches new template-managed files from
      git history but cannot detect stale renames.
    - For each scoped app: `diff scripts/template-manifest.json` against spernakit's. Any divergence other than legitimate per-app `KEEP` overrides indicates the previous dance left the manifest stale in that app. Surface the diff and either include manifest reconciliation in this dance's A2 fan-out (default) or abort if the divergence implies a deeper sync gap. Never proceed silently; a stale manifest poisons drift detection in that app.
8. **Base-reality + gate-freeze check** (per scoped app):
    - **Verify the declared base is real.** Read each app's `spernakit_version` from its
      `package.json` and confirm `git -C <spernakit-root> rev-parse v{version}` resolves AND a few
      probe files match that tag (`git show v{version}:backend/src/utils/errorResponse.ts` vs the
      app's). An app whose files match no surviving tag has no recoverable base; flag it for
      reconstructive handling, not a normal three-way. A `spernakit_version` of a tag the app never
      actually matched is fiction; trust `package.json`/file content, not the number.
    - **Detect a frozen `smoke.json`.** If an app SKIPs `scripts/smoke.json` in `.templateoverrides`,
      compare its qc step count to the template's. A short count means the app froze the runbook and
      is silently missing gates the template added later. A2 must MERGE the current gates into the
      app's smoke.json, not leave the freeze.
    - **Note version distance.** If any app is more than one release behind the target, A2 uses the
      three-way comparison (below), not a two-way packet apply.
9. Write checkpoint: `{ phase: 'preflight-ok', bumpSize, decidedAt }`.

If `--dry-run`, print the bump decision and the scoped app list, then exit.

## Part A - Template Ship + Sync

### A1. Ship the template (once, foreground)

Invoke `Skill: spernakit-bump` with the chosen bump arg (`$1` if provided, else the auto-decided value). This bumps `spernakit/package.json`, runs `bun run supertest`, regenerates screenshots, updates CHANGELOG/docs, commits, tags, and pushes. **Single-instance rule applies**; do not run a second `spernakit-bump` in parallel under any circumstance.

After A1 completes, capture the new template version from `<spernakit-root>/package.json` and record it in the checkpoint.

### A2. Pilot app (foreground)

Run the full A2 sequence on the pilot app first. The pilot defaults to the first pinned app in `<spernakit-root>/spernakit.psd1` (manifest order); override via `--pilot`. Resolve it from the manifest at run time — never assume a specific slug. Pilot must pass cleanly before parallel fan-out.

**Three-way comparison (apps more than one release behind).** A two-way packet (app vs target)
cannot tell "the template moved forward, copy it" from "the app deliberately changed this, copying
destroys it." For each candidate file, compare the app against its real BASE tag as well:
`base == app` means the app never touched it and the template's version is safe to copy;
`base != app` means the app changed it and the copy needs a hand-merge or a leave. Also check
whether the template changed the file at all between base and target: if it changed by zero lines,
LEAVE the app's version regardless.

**A SKIP freezes a file, not the contract around it.** A `.templateoverrides` SKIP keeps the app's
version of a file, but it cannot freeze the API that file depends on. When the template ships a
cross-cutting contract change, inspect the template delta for every SKIPped consumer. After the
safe-copy step, typecheck and hand-port each affected config schema, security guard, service, and
app-owned barrel while preserving the app's domain additions.

**Treat security behavior changes explicitly.** When a copied file changes authorization,
mutability, validation, or another security boundary, run the app's targeted security gate and
commit the change as a distinct, described security fix.

Per-app sequence:

1. `Skill: template-upgrade {app}`: use the supported manual upgrade workflow. Do not create an
   automation helper. For an app several releases behind, use the three-way comparison above.
2. `Skill: template-refactor {app}`: apply structural refactors flagged by the new template version.
3. `Skill: spernakit-diff-sync {app}`: file-by-file drift check across `lib/`, `hooks/`, `utils/`, `components/shared/`. **This step is non-optional**; `template-upgrade` alone misses per-file drift in these directories (Norm 16).
4. **Drizzle journal repair** (Norm A.11): if any `.sql` files exist in `backend/src/db/migrations/` that aren't referenced in `_journal.json`, merge them in via `jq` so the migration runner picks them up.
5. `pwsh ./reset.ps1` to apply migrations and reset dev data.
6. **Rate-limiter flip**: ensure `config/{app}.json` has `rateLimit.enabled: false` for dev. Edit if not.
7. **3-guard verification**:
    - `bun run smoke:qc` passes
    - App starts cleanly: `bun run start` then `curl` the health endpoint
    - No ERROR-level entries in `logs/*.error.log` after startup

If pilot fails any step, halt the entire dance and surface the error. Do **not** auto-fan-out.

### A3. Parallel fan-out

After pilot success, assign the full A2 sequence to one independent worker per remaining scoped app
when the active backend supports delegation. Give each worker the new template version, app path, and
complete A2 checklist. Otherwise process the apps sequentially with the same isolation rules.

**Concurrency caveats**:

- One agent per app; never two agents in the same app directory.
- Each agent owns its app's dev server lifecycle (start, verify, stop).
- Agents must NOT run `bun run smoke:reset` or `bun run stop` for any app other than their own.
- Stop an app's server only if **this agent started it**. If the server was already running when the
  agent arrived, the user owns it; leave it running and do not stop or reset it.

After all agents return, update checkpoint: `{ phase: 'A', completed: [...], failed: [...] }`. If any
failed, finish independent cleanup, present the failures, and exit non-success before Part B. Never
leave the run waiting for direction.

## Part B - Tester + Triage

### B1. Parallel tester fan-out

Assign one independent worker per scoped app to invoke `Skill: spernakit-tester {app}` in exploratory
mode when the active backend supports delegation. Otherwise test apps sequentially. Use the project's
testing-scenarios catalog when present at `{APP_DIR}/.aidd/testing-scenarios.md`.

Before starting a tester, establish a safe database-backed intake baseline for that app:

1. Confirm the app is running and its current source still exposes authenticated
   `POST /api/v1/bugs` plus ADMIN/SYSOP-only
   `GET /api/v1/bugs?page={page}&limit={limit}`.
2. Through the app's supported authenticated session, retrieve the complete report collection with
   `limit=100`. Follow the returned `{ data, page, limit, total }` envelope until all distinct IDs
   are present. Re-fetch page 1; repeat once if its IDs or `total` changed. Treat another change,
   an incomplete page sequence, or an invalid envelope as unstable intake.
3. Record the app-qualified baseline identities (`{app}:{id}`), retrieval time, page count, and total
   in the worker result and `checkpoint.notes`. Never record credentials, tokens, cookies, or CSRF
   values.
4. If authenticated retrieval is unavailable, returns `401`/`403`, or remains unstable, mark Part B
   blocked for that app and do not run a tester that could create reports which this session cannot
   retrieve and triage. Never interpret retrieval failure as zero reports.

Each unblocked worker then:

- Creates a new session-specific evidence directory without deleting earlier tester evidence.
- Runs the standard six-area exploratory sweep through an authenticated application session.
- Submits findings through `POST /api/v1/bugs` and retains each returned numeric report ID.
- Retrieves and stabilizes the complete report collection again using the same pagination rules.
- Computes the post-baseline identity set. Preserve unexpected concurrent reports and flag them;
  do not silently attribute them to the tester.
- Returns `{ app, pagesVisited, baselineReportIds, submittedReportIds, sessionReports, blockers }`,
  where `sessionReports` contains the complete API rows for post-baseline IDs.

### B2. Cluster bugs across the fleet

Use only the DB-backed `sessionReports` returned by B1; never read `data/bugs.json`, a test-data
fallback, or an application database directly. Deduplicate by `{app}:{id}`, then group by signature
(route + error class + first stack frame). Preserve every source identity and returned report row in
the worker result and checkpoint evidence before clustering. Produce a cluster table:
`{ signature, reportIds: [...], apps: [...], severity, sampleTrace }`.

If post-test retrieval fails or is incomplete for any app, stop Part B before routing clusters. The
submitted reports remain safely persisted for a later authenticated retry.

### B3. Routing decision

For each cluster:

- **Cluster size ≥ 3 apps → auto direct-remediation** (Norm 18, confirmed default):
    - Identify the template source file from the trace (will be under `<spernakit-root>/backend/src/` or `frontend/src/`).
    - Fix at the template source directly.
    - Queue a follow-up patch bump for the next dance; record in `checkpoint.directFixes`.
    - **Implementer guidance** (Norm 17): when fixing TypeScript narrowing issues, use type guard
      functions or `typeof` ladders. Do not use `as` casts; `eslint --fix` can strip them as
      unnecessary and cause the next QC run to fail.
    - Log as `B-direct: {bug-title}`.
- **Cluster size 1-2 apps → formal pipeline**:
    - For each affected app, invoke
      `Skill: bug2feature {app} --report-ids {app-specific-report-ids}` to convert only the reports
      in this session into `remediation-*` features.
    - Invoke `Skill: feature-review spernakit + {affected-apps}` to validate the feature specs.
    - Record in `checkpoint.remediationFeatures`.

### B4. Preserve reports and close the phase

Do not delete reports, reset storage, update report status directly, or recreate `data/bugs.json`.
The current API exposes submission and listing but no status or deletion mutation. Do not invent a
`PUT`, `PATCH`, or `DELETE` endpoint and do not edit `bug_reports` directly. If the workflow needs to
mark reports resolved, report the missing supported capability as follow-up work.

For every scoped app, retain the baseline IDs, session report IDs, cluster assignment, triage result,
and retrieval evidence in the worker result and `checkpoint.notes`. This makes resume and audit
possible without consuming or destroying reports. Before completing Part B, verify that every routed
identity appears in exactly one cluster and has either a direct-fix record, a remediation feature, or
an explicit skip/blocker reason.

Write checkpoint:
`{ phase: 'B', remediationFeatures: [...], directFixes: [...], notes: [report evidence...] }`.

## Part C - Remediation Implementation

1. Enumerate features matching `remediation-*` glob in `<spernakit-root>/.aidd/features/`.
2. **Zero features → auto-skip** (confirmed default): write `"Part C: no-op (0 features)"` to checkpoint and proceed directly to Part D.
3. **Features present → implement them directly**:
    - Print the feature list with paths and process it in dependency order.
    - Read each feature, repository instructions, affected implementation, and existing tests.
    - Implement the complete end-to-end remediation, run focused validation, and update feature
      status and pass state only when the evidence supports completion.
    - Record `{ phase: 'C', completed: [...], failed: [...] }` after processing every feature.
    - If any feature remains unresolved, preserve its backlog state and exit non-success before Part
      D with exact evidence. Otherwise continue directly to Part D.

## Part D - Verify + Close

### D1. Parallel supertest fan-out

Run `bun run supertest` once per scoped app. Use one independent worker per app when supported, but
never run two supertest processes in the same directory.

### D2. Parallel smoke:qc fan-out

Run `bun run smoke:qc` once per scoped app. Use one independent worker per app when supported. This
required phase remains separate from supertest (Norm 15) because the gates cover different failures.

### D3. Bump and tag derived apps

For each app that passed D1+D2:

1. Bump the app's `spernakit_version` field in `package.json` to match the new template version.
2. Decide app's own version bump (same auto-decide logic as spernakit, scoped to the app's git history).
3. Commit, tag `v{X.Y.Z}`, push.

### D4. Dev diary update

Invoke `Skill: devdiary-update`. It creates technical (`DD.md`) and non-technical (`DDhl.md`) entries
for today and updates the `devstory.md` footer.

### D5. Session report

**Additive to, not a replacement for, D4's `DD.md`/`DDhl.md`.** The session report is a dance-specific artifact capturing fleet-wide outcomes (per-app status matrix, supertest/smoke:qc results, direct fixes, remediation features) that would clutter the daily diary entries. Write alongside, not instead of.

Write to `<applications-root>/devdiary/entries/YYYY/MM/DD-dance-session.md`:

```markdown
# Dance Session: YYYY-MM-DD

**Bump**: spernakit v{prev} → v{new} ({patch|minor})
**Rationale**: {one-line summary of the auto-decided rationale}
**Scope**: {apps}
**Wall time**: {elapsed}

## Per-app status

| App | A   | B   | C   | D   | Notes |
| --- | --- | --- | --- | --- | ----- |
| ... | ✓   | ✓   | N/A | ✓   | ...   |

## Direct remediation (Part B)

- {bug title}: fixed at {template path} ({apps affected})

## Formal remediation features (Part B → C)

- {feature path}

## supertest results (Part D1)

| App | Result |
| --- | ------ |

## smoke:qc results (Part D2)

| App | Result |
| --- | ------ |

## Lessons learned

- {anything new that should fold back into the operator's standing dance-orchestration norms}
```

The status tables are the point of this artifact; keep them. Prose lines (rationale, remediation
descriptions, lessons) follow the humanize-docs style contract
(`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo): flat factual statements, no aphorisms or
lesson-lines, no AI filler.

Write checkpoint: `{ phase: 'D-complete', completedAt }`.

## Resume Behavior

`--resume-from <A|B|C|D>` reads `.dance-state.json` and skips all earlier phases. Always run
preflight and validate that the checkpoint's scope and bump match before resuming. If flags changed
either value, rename the checkpoint to `.dance-state.mismatch-<timestamp>.json`, report the preserved
path, initialize a fresh checkpoint, and restart from Phase 0.

## Upgrade Constraints

- Run smoke:qc across the fleet as its own required phase.
- Check per-file drift in `lib/`, `hooks/`, `utils/`, and `components/shared/`.
- Record parity overrides explicitly and keep `routes.tsx` entries alphabetical.
- Keep `scripts/template-manifest.json` byte-identical across Spernakit and derived apps.
- Use the real base tag for multi-version catch-up and hand-port skipped files across contract
  migrations.
- Merge new gates into a customized `smoke.json`; never preserve a stale gate set.
- Preserve required license-material copy steps in branded Dockerfiles.
- Remove the Spernakit leak guard from derived apps and record a `DELETED` override.
- When a template fix requires retagging, resync apps already upgraded and restore the prior release
  tag before running `document-changes`.

## Out of Scope

Do not auto-implement Part C remediation features, and do not include non-Spernakit apps in scope
(the fleet manifest is what defines membership). If a dance fails after tagging, roll back with `git revert` and retag manually.
