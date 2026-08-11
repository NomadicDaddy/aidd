---
name: spernakit-dance
description: 'Run The Dance across Spernakit and derived apps: ship the template, sync each app via three-way base comparison, test, remediate, verify, tag, and report with checkpointed resume. Use for The Dance, propagation, or a fleet-wide release.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: >-
        humanize-docs, spernakit-bump, spernakit-template-upgrade,
        spernakit-template-refactor, spernakit-diff-sync, spernakit-tester, bug2feature,
        feature-review, devdiary-update
---

# Propagate the Spernakit Fleet

Propagate the Spernakit template through its derived applications.

During development, it is completely normal to perform the dance often.

## Spernakit Registry

Fleet membership lives in:

- `<spernakit-root>/spernakit.psd1`
- `<applications-root>/AGENTS.md` (canonical app list)

**The manifest declares membership; the app declares its own ports and versions.** `spernakit.psd1`
is a mirror, and `scripts/lib/fleet/manifest.ts` treats it as one: `validateFleetManifest` compares
every entry against the app's tracked `package.json` (`version`, `spernakit_version`) and its runtime
`config/<slug>.json` (`server.backendPort`, `server.frontendPort`). Read those files, not the
manifest, whenever a concrete port or version matters — the manifest is gitignored, hand-maintained,
and goes stale the moment an app bumps (see D3). There is no `dev.*` key in any app's config; the
ports live under `server`. Do not infer a port from `.env` or a Vite default either; an app that
moved its ports leaves both of those behind.

**Default scope**: all registered derived apps in `<spernakit-root>/spernakit.psd1`. Every
derived-app entry must have a concrete semantic `spernakit_version`; abort preflight when the
manifest is missing one or contains a non-semver value. `spernakit/spernakit.psd1` is authoritative;
do not hardcode app counts, lists, or individual app slugs elsewhere. `spernakit-lite` apps are out
of default scope; include only when explicitly passed via `--scope`.

## Usage

```
spernakit-dance [bump-hint] [--scope <app,...>] [--pilot <app>]
                [--skip-parts <A,B,C,D>] [--resume-from <A|B|C|D>] [--dry-run]
```

- Zero args → infer the bump from Git history and process all pinned derived apps.
- `[bump-hint]` → `+0.0.1` or `+0.1.0`.
- Flags use the defaults and meanings in the Arguments table below.

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

`perApp` is the per-app record of record, keyed by app slug. Each entry carries `A`, `B`,
`D1_supertest`, and `D2_smokeqc` — each one `pending`, `ok`, `failed`, or `skipped` — plus
`D3_tagged` (the tag string written, or null) and `lastError`. Use those four status values and no
others: nothing validates this file, so an invented status such as `completed` survives into the next
resume and reads as neither done nor pending. There are no top-level `completed` or `failed` arrays.
Per-app outcomes go in `perApp`; phase-wide facts and owner decisions go in `notes`.

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

Invoke `Skill: spernakit-bump` with the chosen bump arg (`$1` if provided, else the auto-decided value). This bumps `spernakit/package.json`, runs `bun run supertest`, regenerates screenshots, updates CHANGELOG/docs, commits, pushes `main`, waits for CI to go green on that commit, tags, and then confirms the release published. **Single-instance rule applies**; do not run a second `spernakit-bump` in parallel under any circumstance.

A1 is not complete when the tag is pushed. `release.yml` polls for a green CI run on the tagged commit and gives up after 10 minutes, so a tag pushed ahead of CI produces a tag with no release behind it. Every derived app resolves its sync source from that tag; carrying on into A2 against a half-shipped template propagates from a version that was never published.

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

**Read every override from the target side, not only the app side.** An override suppresses the
drift finding for its path outright, so the template's later changes to that same file are invisible
for as long as the entry stands — including changes that have nothing to do with the reason the
override was taken. For each `.templateoverrides` entry, diff the app's file against
`git show v{target}:{path}` and account for every hunk, then rewrite the reason text to describe
what the override withholds _now_. A `branded` classification suppresses the same way an override
does; treat it the same. Delete any entry whose target-side delta has become empty.

**A green gate is not evidence that app-owned work survived the copy.** Drift detection answers
"does this file differ from the template", never "did the copy delete something the app wrote".
One app lost an app-added `memberRole` field from `frontend/src/api/types/workspaces.ts` this way, and only the typechecker caught it, and only
because a page happened to consume the field. After the copy step and before the app's release
commit, audit the removed lines: for every line the upgrade deleted from a template-managed path,
check whether any commit in the template repository ever contained it. A removed line the template
once had is stale content the upgrade is meant to replace; a removed line the template never had was
written by the app. Normalize trailing commas before comparing, or the `trailingComma: all` reflow
from v3.31.0 buries the signal. Restrict the report to paths whose app history carries a commit
after `init` — a file untouched since the app was seeded holds pre-3.28.2 template content that no
surviving tag can match.

**Treat security behavior changes explicitly.** When a copied file changes authorization,
mutability, validation, or another security boundary, run the app's targeted security gate and
commit the change as a distinct, described security fix.

Per-app sequence:

1. `Skill: spernakit-template-upgrade {app}`: use the supported manual upgrade workflow. Do not create an
   automation helper. For an app several releases behind, use the three-way comparison above.
2. `Skill: spernakit-template-refactor {app}`: apply structural refactors flagged by the new template version.
3. `Skill: spernakit-diff-sync {app}`: file-by-file drift check across `lib/`, `hooks/`, `utils/`, `components/shared/`. **This step is non-optional**; `spernakit-template-upgrade` alone misses per-file drift in these directories (Norm 16).
4. **Lost-lines audit**: report every line the copy removed from a template-managed path that no
   commit in the template repository ever contained, restricted to files whose app history carries a
   commit after `init`. Any hit is app-authored work the upgrade dropped; restore it before
   continuing. Do not accept a clean `smoke:qc` in place of this.
5. **Override target-side read**: for each `.templateoverrides` entry, diff the app's file against
   `git show v{target}:{path}`, account for every hunk, and rewrite the reason text to describe what
   the entry withholds at this version. Delete entries whose delta is now empty.
6. **Drizzle journal repair** (Norm A.11): if any `.sql` files exist in `backend/src/db/migrations/` that aren't referenced in `_journal.json`, merge them in via `jq` so the migration runner picks them up.
7. `pwsh ./reset.ps1` to apply migrations and reset dev data.
8. **Rate-limiter flip**: ensure `config/{app}.json` has `rateLimit.enabled: false` for dev. Edit if not.
9. **3-guard verification**:
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

After all agents return, set `perApp[app].A` to `ok` or `failed` for every scoped app, write
`lastError` on each failure, and update `{ phase: 'A' }`. If any failed, finish independent cleanup,
present the failures, and exit non-success before Part B. Never leave the run waiting for direction.

## Part B - Tester + Triage

### B1. Parallel tester fan-out

Assign one independent worker per scoped app to invoke `Skill: spernakit-tester {app}` in exploratory
mode when the active backend supports delegation. Otherwise test apps sequentially. Use the project's
testing-scenarios catalog when present at `{APP_DIR}/.aidd/testing-scenarios.md`.

Before starting a tester, establish a safe database-backed intake baseline for that app:

1. **Start the app unless it is already running.** Part B needs a session that outlives the command
   that created it, and neither dev entry point provides one: `bun run smoke:dev` starts, crawls, and
   stops by design, while `bun run dev` holds the foreground indefinitely
   (`scripts/dev-with-logs.ts` calls `process.stdin.resume()`), so a worker that backgrounds it loses
   the server the moment its turn ends. Use `bun run start`, the same launcher A2's 3-guard step
   already uses: it spawns backend and frontend as detached processes, writes PID files, and returns
   once both are listening. Confirm the app answers on the `server.frontendPort` from
   `config/<slug>.json`. If the server was already running when the worker arrived, leave it alone
   and do not restart it — per the concurrency caveats above, it belongs to the user.
2. Confirm its current source still exposes authenticated `POST /api/v1/bugs` plus ADMIN/SYSOP-only
   `GET /api/v1/bugs?page={page}&limit={limit}`.
3. Through the app's supported authenticated session, retrieve the complete report collection with
   `limit=100`. Follow the returned `{ data, page, limit, total }` envelope until all distinct IDs
   are present. Re-fetch page 1; repeat once if its IDs or `total` changed. Treat another change,
   an incomplete page sequence, or an invalid envelope as unstable intake.
4. Record the app-qualified baseline identities (`{app}:{id}`), retrieval time, page count, and total
   in the worker result and `checkpoint.notes`. Never record credentials, tokens, cookies, or CSRF
   values.
5. If the app cannot be started, or authenticated retrieval is unavailable, returns `401`/`403`, or
   remains unstable, mark Part B blocked for that app and do not run a tester that could create
   reports which this session cannot retrieve and triage. Never interpret retrieval failure as zero
   reports. An unreachable URL is not by itself a blocker: start the app first, and block only if
   the start fails. Blocking a whole fan-out on servers nobody was told to start is a false negative
   — every app reports blocked while its `smoke:qc` is green.

Each unblocked worker then:

- Creates a new session-specific evidence directory without deleting earlier tester evidence.
- Runs the standard six-area exploratory sweep through an authenticated application session.
- Submits findings through `POST /api/v1/bugs` and retains each returned numeric report ID.
- Retrieves and stabilizes the complete report collection again using the same pagination rules.
- Computes the post-baseline identity set. Preserve unexpected concurrent reports and flag them;
  do not silently attribute them to the tester.
- Returns `{ app, pagesVisited, baselineReportIds, submittedReportIds, sessionReports, blockers }`,
  where `sessionReports` contains the complete API rows for post-baseline IDs.

**Prove the tool before filing a keyboard finding.** `agent-browser key` can report success while
the page receives no event, which turns every keyboard-accessibility check into a false positive:
Escape "does not close" the dialog, Enter "does not submit" the form, Tab "does not move" focus.
Before recording any keyboard finding, run a self-test on a control whose keyboard behaviour is
already known to work in that app, and confirm the page observed the key. If the self-test fails,
the tool is not delivering keystrokes — fall back to an in-page `dispatchEvent` with the equivalent
`KeyboardEvent`, or mark keyboard coverage as not-tested for that app. Never file a keyboard finding
on a run whose self-test did not pass; a retracted report costs more than an untested surface.

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
      in this session into features.
    - **`remediation-*` is a template-only name.** A cluster filed against `<spernakit-root>` takes
      `remediation-<YYYYMMDD>-<slug>`; a cluster filed against a derived app takes a clean
      descriptive slug and records its origin in `title` and `notes`. Check the id before writing the
      directory, not after: `resident.ts` fails `check:template-features` on any resident
      `remediation-<date>-…` or `audit-<slug>-<digits>-…` directory in an app, at every template
      version and with no exemption for app ownership, and it short-circuits before comparing a
      single durable record. A record written here under the wrong name therefore surfaces at D2 as a
      whole-app sync failure two phases later, with that app's real drift hidden underneath it. The
      v3.37.0 dance did exactly this to deeper.
    - Ownership decides the target repository. When the defect's source file is byte-identical to the
      template, file against spernakit even at cluster size 1: a fix in a template-managed file
      inside an app is either reverted by the next sync or reported as drift. When the template has
      zero occurrences of the pattern, the finding is app-owned.
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
`{ phase: 'B', remediationFeatures: [...], directFixes: [...], notes: [report evidence...] }`, and
set `perApp[app].B` for every scoped app: `ok` when its baseline, sweep, and post-test retrieval all
completed, `failed` with `lastError` when B1 marked it blocked.

## Part C - Remediation Implementation

**Part C implements, and it implements without prompting.** It is the phase that consumes what B3's
formal pipeline queued; read the other way it is dead code, and the dance tags every derived app at
D3 with triaged defects still open and nobody told. What is bounded here is the backlog Part C is
allowed to touch, not whether it does the work — see Out of Scope.

1. Enumerate features matching `remediation-*` glob in `<spernakit-root>/.aidd/features/`.
2. **Zero features → auto-skip** (confirmed default): write `{ phase: 'C-skipped' }` with
   `"Part C: no-op (0 features)"` in `notes`, and proceed directly to Part D.
3. **Features present → implement them directly**:
    - Write `{ phase: 'C-pending' }` before touching the first feature, so a run interrupted mid-phase
      resumes into C rather than replaying B or skipping ahead to D.
    - Print the feature list with paths and process it in dependency order.
    - Read each feature, repository instructions, affected implementation, and existing tests.
    - Implement the complete end-to-end remediation, run focused validation, and update feature
      status and pass state only when the evidence supports completion.
    - Record `{ phase: 'C-complete' }` after processing every feature, listing resolved and unresolved
      feature paths in `notes`. Part C works the template's own feature backlog, not the fleet, so it
      writes no `perApp` fields.
    - If any feature remains unresolved, leave the checkpoint at `C-pending`, preserve that feature's
      backlog state, and exit non-success before Part D with exact evidence. Otherwise continue
      directly to Part D.

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
4. Update the app's `spernakit.psd1` entry to the values just committed (`version`,
   `spernakit_version`, and the ports from `config/<slug>.json`). The manifest is gitignored, so
   nothing else will ever record the change.

After every scoped app has been bumped, run `bun run check:fleet-manifest` in `<spernakit-root>` and
require exit 0 before writing the D-complete checkpoint. The manifest is a mirror of the fleet, so a
successful dance is exactly what makes it stale: bumping seven apps and syncing four leaves twelve
mismatches, and the template's own `smoke:qc` goes red on a phase that already reported success. A
dance that closes without this check hands the next dance a Phase 0 abort that has nothing to do
with the template.

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

Write checkpoint: `{ phase: 'D-complete', completedAt }`. D1, D2, and D3 each set their own `perApp`
field as they go — `D1_supertest`, `D2_smokeqc`, and `D3_tagged` (the tag string written, or null for
an app that was not tagged) — so write those at each step rather than reconstructing them here.

## Resume Behavior

`--resume-from <A|B|C|D>` reads `.dance-state.json` and skips all earlier phases. Within the phase it
resumes, skip every app whose `perApp` field for that phase is already `ok`, and re-run the ones
marked `failed` or `pending`. A dance interrupted partway through a fan-out leaves apps already
committed and tagged; re-running those repeats work the checkpoint has already accounted for.
`--skip-parts` still skips whole parts regardless of `perApp`.

Part C is the exception, because it writes no `perApp` fields. Resume it from the backlog instead:
re-run C1's enumeration and skip every feature already at a completed, passing status. The feature
records decide what is left; `notes` only describes what the interrupted run believed it had done.

Always run preflight and validate that the checkpoint's scope and bump match before resuming. If
flags changed either value, rename the checkpoint to `.dance-state.mismatch-<timestamp>.json`, report
the preserved path, initialize a fresh checkpoint, and restart from Phase 0. Narrowing `--scope` to a
subset counts as such a change: edit the checkpoint's `scope` to the intended list before launching,
so the flag agrees with it, or the resume discards the checkpoint and starts the dance over.

## Upgrade Constraints

- Run smoke:qc across the fleet as its own required phase.
- Check per-file drift in `lib/`, `hooks/`, `utils/`, and `components/shared/`.
- Record parity overrides explicitly and keep `routes.tsx` entries alphabetical.
- Keep `scripts/template-manifest.json` byte-identical across Spernakit and derived apps.
- Use the real base tag for multi-version catch-up and hand-port skipped files across contract
  migrations.
- Merge new gates into a customized `smoke.json`; never preserve a stale gate set.
- Audit removed lines against the template's own history before every release commit; a green gate
  does not prove app-owned work survived the copy.
- Read every override and every `branded` file from the target side, not only the app side.
- Refresh `spernakit.psd1` from each app after D3 and require `check:fleet-manifest` to exit 0.
- Start each app with `bun run start` before its Part B tester; `smoke:dev` stops itself and `dev`
  cannot be held open by a worker, so neither leaves a session to authenticate against.
- Record per-app outcomes in `perApp` using its four status values, never in invented top-level keys.
- Take ports and versions from `config/<slug>.json` and `package.json`, never from the manifest,
  `.env`, or a framework default.
- Format-check `.aidd` metadata with an explicit `--ignore-path` override; `/.aidd/` sits in
  `.prettierignore`, so an unqualified `prettier --check` on those paths passes having read nothing.
- Preserve required license-material copy steps in branded Dockerfiles.
- Keep the leak guard in derived apps. Template v3.35.0 put the two-tier guard on the template
  surface: `.githooks/leak-guard.sh`, `.githooks/leak-guard-setup.sh`, `scripts/check-leak-guard.sh`
  and `scripts/run-bash.ts` ship to every app, `check:leak-guard` is a real qc step rather than a
  `templateOnly` one, and `scripts/check-leak-guard.sh` is no longer drift-excluded. Deleting it and
  recording a `DELETED` override is the pre-3.35.0 instruction, and following it now strips a working
  commit-time secret guard out of every app it touches.
- When a template fix requires retagging, resync apps already upgraded and restore the prior release
  tag before running `document-changes`.

## Out of Scope

Part C's limit is which backlog it may work, not whether it works one. It implements the
`remediation-*` features in `<spernakit-root>/.aidd/features/` that step C1 enumerated, and nothing
else: not a derived app's `.aidd/features/`, not template features outside the `remediation-*` glob,
and not work that arrived after C1 ran. A derived app's own backlog belongs to a separate run against
that app.

Do not include non-Spernakit apps in scope (the fleet manifest is what defines membership). If a
dance fails after tagging, roll back with `git revert` and retag manually.
