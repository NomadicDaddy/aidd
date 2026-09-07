---
name: spernakit-dance
description: 'Run The Dance across Spernakit and derived apps: ship the template, sync each app via three-way base comparison, test, remediate, verify, tag, and report with checkpointed resume. Use for The Dance, propagation, or a fleet-wide release.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: >-
        humanize-docs, spernakit-bump, spernakit-template-upgrade,
        spernakit-template-refactor, spernakit-diff-sync, spernakit-tester, bug2feature,
        feature-review, devdiary-update, document-changes, tester, testing-scenarios,
        prompt-guidelines
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md, docs/template/TESTING.md, docs/template/CHANGELOG.md
---

# Propagate the Spernakit Fleet

Propagate the Spernakit template through its derived applications.

During development, it is completely normal to perform the dance often.

## Spernakit Registry

Fleet membership lives in `<spernakit-root>/spernakit.psd1`; `<applications-root>/AGENTS.md`
supplies workspace rules, not the fleet list. Each app owns its ports and versions, so read
`package.json` and `config/<slug>.json` whenever a concrete value matters. Default scope is every
registered derived app; `spernakit-lite` apps join only via `--scope`. Full rules in
[references/fleet-registry.md](references/fleet-registry.md).

## Usage

```
spernakit-dance [bump-hint] [--scope <app,...>] [--pilot <app>]
                [--skip-parts <A,B,C,D>] [--resume-from <A|B|C|D>] [--dry-run]
```

- Zero args → infer the bump from Git history and process all registered derived apps.
- `[bump-hint]` → `+0.0.1` or `+0.1.0`.
- Flags use the defaults and meanings in the Arguments table below.

## Arguments

| Arg                    | Default                      | Purpose                                                                                                                                                             |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$1` (bump-hint)       | auto-decide                  | `+0.0.1` or `+0.1.0`. If absent, the skill analyzes `git log` since last tag and decides without prompting.                                                         |
| `--scope <apps>`       | all registered derived apps  | CSV of derived apps to dance through (e.g., `--scope app-one,app-two`). `spernakit-lite` apps only included when named explicitly.                                  |
| `--pilot <app>`        | first registered derived app | App to run Part A on first; remaining apps fan out in parallel after pilot succeeds. Resolve the default from the manifest at run time rather than assuming a slug. |
| `--skip-parts <list>`  | none                         | CSV of `A,B,C,D` to skip (escape hatch for partial reruns).                                                                                                         |
| `--resume-from <part>` | none                         | Resume from checkpoint at Part A/B/C/D. Reads `<applications-root>/.dance-state.json`.                                                                              |
| `--dry-run`            | off                          | Print intended actions, write no commits, run no supertests.                                                                                                        |

## Checkpoint Schema

The skill maintains state at `<applications-root>/.dance-state.json`. Schema documented in `state-schema.json` co-located with this SKILL.md. Always write the checkpoint after each phase transition so a crash mid-dance can resume cleanly.

`perApp` is the per-app record of record, keyed by app slug, and the only place per-app outcomes
go; phase-wide facts and owner decisions go in `notes`. Nothing validates this file, so its field
rules matter — see [references/checkpoint.md](references/checkpoint.md).

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
    - **Drop apps already at the target version.** An app whose `package.json` `spernakit_version`
      already equals the target upgraded outside this dance and has probably built on top of it.
      Record it in `notes` as out of scope with the reason, remove it from `scope`, and leave its
      release tag to the owner. quorumail took v3.44.0 the night before that dance and shipped two
      features on it; re-running A2 against it would have re-applied a delta it already had.
5. **Rate-limiter precheck**: inspect each scoped app's active development configuration. For rapid
   multi-role login tests, require both `rateLimit.enabled` and `rateLimit.authEnabled` to be
   `false`. Prefer process-local overrides that are restored when testing ends. If the app does not
   support a reversible override, keep persistent configuration unchanged and run rate-aware tests.
6. **Pode core precheck** (any app whose stack is `spernakit+pode`): these apps require the Pode core backend to be running for dev/start and for tester traffic to succeed. `bun run dev` / `bun run start` in these apps is expected to launch core; verify the app's dev/start script does so (grep the script for a Pode launcher invocation). If the script does not start core, abort and surface the gap; do not proceed to tester without core — results gathered without core are not evidence of anything.
7. **Manifest validation** (spernakit + scoped apps):
    - For Spernakit: verify every `branded`, `buildCriticalBranded`, and `infrastructure` path in
      `scripts/template-manifest.json` exists and every build-critical path is also branded.
    - For each scoped app: require `scripts/template-manifest.json` to be byte-identical to
      spernakit's. A `KEEP` override for the manifest is itself a blocker, not a legitimate app
      exception. Reconcile the file in A2 or abort; stale classifications poison drift detection.
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

Invoke `Skill: spernakit-bump` with the chosen or auto-decided bump. It owns validation and the
current release-branch, PR, merge, CI, tag, and publication workflow. **Never run two instances.**

A1 is not complete when the tag is pushed. `release.yml` polls for a green CI run on the tagged commit and gives up after 10 minutes, so a tag pushed ahead of CI produces a tag with no release behind it. Every derived app resolves its sync source from that tag; carrying on into A2 against a half-shipped template propagates from a version that was never published.

After A1 completes, capture the new template version from `<spernakit-root>/package.json` and record it in the checkpoint.

### A2. Pilot app (foreground)

Run A2 first on `--pilot` or the first derived app in manifest order. Require green before fan-out.

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

1. `Skill: spernakit-template-upgrade {app} --to v{templateVersion.to}`: pass the exact version
   published in A1. Use the supported manual upgrade workflow; do not create an automation helper.
   For an app several releases behind, use the three-way comparison above.

    **Run `template-sync-plan.ts` from `<spernakit-root>`, never from the app.** The script resolves
    the template repository as its own `scripts/..`, so the copy shipped into a derived app looks for
    the template tag in the app's own history and exits with `Template tag v{from} was not found.`
    The app's `bun run template:sync-plan` can therefore never work. The working invocation is
    `bun scripts/template-sync-plan.ts --app ../{app} --from {base} --to {target}` from the template.

    **Intersect the apply list with the release delta.** The packet is a two-way app-vs-target
    comparison: `--from` is validated and printed in the header and never used to filter, so a file
    the release did not touch shows as needing attention purely because the app diverged from it on
    purpose. Take `git -C <spernakit-root> diff --name-only v{base} v{target}` and apply only inside
    that set. Everything else the packet lists is drift to read, not drift to copy. This applies to
    every app, not only the ones more than one release behind.

2. `Skill: spernakit-template-refactor {app}`: apply structural refactors flagged by the new template version.
3. `Skill: spernakit-diff-sync {app} frontend/src/lib frontend/src/hooks frontend/src/utils
frontend/src/components/shared`: pass every drift area explicitly. **This step is non-optional**;
   `spernakit-template-upgrade` alone misses per-file drift in these directories (Norm 16).
4. **Lost-lines audit**: report every line the copy removed from a template-managed path that no
   commit in the template repository ever contained, restricted to files whose app history carries a
   commit after `init`. Any hit is app-authored work the upgrade dropped; restore it before
   continuing. Do not accept a clean `smoke:qc` in place of this.
5. **Override target-side read**: for each `.templateoverrides` entry, diff the app's file against
   `git show v{target}:{path}`, account for every hunk, and rewrite the reason text to describe what
   the entry withholds at this version. Delete entries whose delta is now empty.
6. **Migration integrity**: after schema changes run `bun run db:generate`; review `backend/drizzle/` SQL and its journal instead of patching either by hand.
7. `bun scripts/reset-database.ts --force`, then `bun run db:setup`, to reset dev data and apply migrations.
8. **Rate-limiter flip**: set both `rateLimit.enabled` and `rateLimit.authEnabled` false for dev.
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
   `GET /api/v1/bugs?page={page}&limit={limit}&includeSuperseded=true`.
3. Through the app's supported authenticated session, retrieve the complete report collection with
   `limit=100&includeSuperseded=true`; the default listing omits replaced reports. Follow the
   returned `{ data, page, limit, total }` envelope until all distinct IDs are present. Re-fetch
   page 1; repeat once if its IDs or `total` changed. Treat another change, an incomplete page
   sequence, or an invalid envelope as unstable intake.
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
- Returns the exact `spernakit-tester` Dance handoff object:
  `{ app, pagesVisited, baselineReportIds, submittedReportIds, sessionReports, blockers }`.
  `sessionReports` contains complete post-baseline API rows; do not parse values from prose.

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
    - **A record authored in a derived app must not carry `spernakit_version`.** That field is a
      provenance marker, not a timestamp of when the record was written. Setting it makes
      `sync-template-features` classify the record as template-owned, and because the template does
      not ship it, `check:template-features` marks it for pruning and fails that app's
      `smoke:reset` one phase later. Template-owned records carry the field; app-authored ones
      leave it out entirely. The v3.44.0 dance filed g5's auth record with
      `"spernakit_version": "3.44.0"` and needed a follow-up commit to remove it.
    - **Anything written into `<spernakit-root>/.aidd/features/` must be pushed out in the same
      step.** `check:template-features` has no smoke-cache entry, so it reads the live template
      filesystem on every run in every app. Adding two records to the template's own corpus mid-dance
      turned that gate red in all ten apps at once in the v3.43.3 dance. Follow any such write with
      `bun scripts/sync-template-features.ts --all` before the next app's gate runs. Leaving
      spernakit checked out on a feature branch does the same thing to `check:drift`.
    - **`remediation-*` names a finding, not an owner.** A cluster of defects takes
      `remediation-<YYYYMMDD>-<slug>` in whichever repository it is filed against, spernakit and
      derived apps alike, and records its origin in `title` and `notes`. Since 2026-08-26
      `resident.ts` judges a resident record on provenance — a counterpart in the template corpus,
      or a `spernakit_version` stamp — so an unstamped record an app authored itself no longer
      surfaces at D2 as the whole-app sync failure that hid deeper's real drift in the v3.37.0
      dance. What still short-circuits that app's entire sync, before a single durable record is
      compared, is a resident record carrying `spernakit_version`: never set that field on a record
      written into an app, and never copy a template record into one.
    - Ownership decides the target repository. When the defect's source file is byte-identical to the
      template, file against spernakit even at cluster size 1: a fix in a template-managed file
      inside an app is either reverted by the next sync or reported as drift. When the template has
      zero occurrences of the pattern, the finding is app-owned.
    - Invoke `Skill: feature-review` once in each repository whose feature files changed.
      It accepts no app-list argument and always reviews the current repository.
    - Record in `checkpoint.remediationFeatures`.

### B4. Preserve reports and close the phase

Do not delete reports, reset storage, change report status, alter supersede links, or recreate
`data/bugs.json`. The API supports `PATCH /api/v1/bugs/{id}` for ADMIN+ status changes and
`PUT /api/v1/bugs/{id}/superseded-by` for supported corrections, but this triage workflow does not
authorize either mutation. Never edit `bug_reports` directly or invent a deletion endpoint.

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

**Bump before D1, tag after D1.** `smoke:screenshots` writes to
`screenshots/v{appVersion}-sv{spernakitVersion}/`, so a supertest run before the bump both mislabels
the new UI as the old version and overwrites the previous release's archive. The version bump and its
release commit therefore land first, and the tag is withheld until D1 is green. That way the
screenshots are filed under the version they depict and no tag ever exists for a build that has not
passed. Do the D3 bump-and-commit steps for an app, then run its D1, then tag it.

### D1. supertest fan-out

Run `bun run supertest` once per scoped app. Use one independent worker per app when supported, but
never run two supertest processes in the same directory.

`supertest` is `smoke:reset && smoke:docker-prod && smoke:screenshots`, and `smoke:reset` is seven
steps ending in `bun run smoke:qc` and the two docker builds. It is the long phase of the dance and
the one most likely to be interrupted.

When a fan-out dies without producing a failing step, that is not an app failure — see
[references/supertest-recovery.md](references/supertest-recovery.md) for the foreground fallback,
`smoke:screenshots` as a standalone resume, and how to reclaim orphaned containers and ports.

### D2. smoke:qc

**`smoke:qc` is a step inside `smoke:reset`, which is a step inside `supertest`.** D1 therefore
satisfies D2 whenever the app's tree is at the same commit and clean before and after its supertest.
In that case record D2 as satisfied-in-D1 with the log line numbers of the in-run `smoke:qc` pass,
and set `perApp[app].D2_smokeqc` to `ok`. Re-running it would be a cached no-op recorded as
independent evidence, which is worse than citing the run that actually happened.

Run `bun run smoke:qc` separately only when D1 did not run to completion for that app, or when the
tree changed after the supertest. Use one independent worker per app when supported.

**A green pre-commit is not a green `smoke:qc`.** `.githooks/pre-commit` runs leak-guard plus
`smoke:qc:fast`, which is four steps from the full qc set: `check:max-lines`, `typecheck`,
`format:check`, `lint` (`scripts/lib/smoke/fast-subset.ts`). `check:template-features`,
`check:aidd-format`, `check:drift` and the whole test suite are not in it. Never cite a clean commit
as gate evidence.

### D3. Bump and tag derived apps

Steps 1-3 run **before** that app's D1; steps 4-5 run after it comes back green.

1. Bump the app's `spernakit_version` field in `package.json` to match the new template version.
2. Decide app's own version bump (same auto-decide logic as spernakit, scoped to the app's git history).
3. Commit the release. **Scan the pending change for sibling repository names first.** The two-tier
   leak guard reads a pattern file naming every private sibling repository, and a feature note or
   changelog line that names another app by slug blocks the commit. In the v3.43.3 dance this refused
   nine release commits in a row on one such note. Fix it at source and resync rather than
   discovering it once per app.
4. After D1 is green for that app, tag `v{X.Y.Z}`.
5. Run `bun run fleet-manifest:sync` from `<spernakit-root>` to refresh the app's gitignored mirror
   from its committed `package.json`, defaults slug, and runtime `config/<slug>.json`.

**Push only where a remote exists.** Derived apps in this fleet have no git remote, so their tags are
annotated and local and there is nothing to push. Check `git remote -v` rather than assuming either
way; do not report a dance incomplete because a push had no target.

**Never loop the whole fleet inside one command.** A single loop over ten apps exceeded the ten-minute
command budget in the v3.43.3 dance with three apps unfinished, and one app's failure was swallowed
by a `tail -2` on its output. Run the loop per app, or in small batches, and preserve each app's
error output verbatim.

After every scoped app has been bumped, run `bun run check:fleet-manifest` in `<spernakit-root>` and
require exit 0 before writing the D-complete checkpoint. The manifest is a mirror of the fleet, so a
successful dance is exactly what makes it stale: bumping seven apps and syncing four leaves twelve
mismatches, and the template's own `smoke:qc` goes red on a phase that already reported success. A
dance that closes without this check hands the next dance a Phase 0 abort that has nothing to do
with the template.

### D4. Dev diary update

Invoke `Skill: devdiary-update`. It writes or amends every warranted technical (`DD.md`) and
non-technical (`DDhl.md`) entry in its scan window and updates the `devstory.md` footer.

### D5. Session report

**Additive to D4's `DD.md`/`DDhl.md`.** The session report captures fleet-wide outcomes: per-app
status, gates, direct fixes, and formal issue features. Write it alongside the daily diaries.

Write to `<applications-root>/devdiary/entries/YYYY/MM/DD-dance-session.md` using
[references/session-report-template.md](references/session-report-template.md), which carries the
template, the rule that every scope decision is recorded (not only the apps processed), and the
prose style contract.

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

**Phase 0 gates every resume.** It runs unconditionally, and steps 2 and 4 require a green spernakit
`smoke:qc` and clean trees in every scoped app, so an interrupted dance cannot resume until the app
it died in is committed or reset. `spernakit.psd1` is gitignored and follows the apps, so a
half-bumped fleet also needs `bun run fleet-manifest:sync` before `check:fleet-manifest` will pass.
Neither is a deviation from the dance; both are the price of resuming it.

Always run preflight and validate that the checkpoint's scope and bump match before resuming. If
flags changed either value, rename the checkpoint to `.dance-state.mismatch-<timestamp>.json`, report
the preserved path, initialize a fresh checkpoint, and restart from Phase 0. Narrowing `--scope` to a
subset counts as such a change: edit the checkpoint's `scope` to the intended list before launching,
so the flag agrees with it, or the resume discards the checkpoint and starts the dance over.

## Upgrade Constraints

The standing norms live in
[references/upgrade-constraints.md](references/upgrade-constraints.md). Read them before Part A and
again before Part D; every one of them is a rule some earlier dance had to learn.

## Out of Scope

Part C's limit is which backlog it may work, not whether it works one. It implements the
`remediation-*` features in `<spernakit-root>/.aidd/features/` that step C1 enumerated, and nothing
else: not a derived app's `.aidd/features/`, not template features outside the `remediation-*` glob,
and not work that arrived after C1 ran. A derived app's own backlog belongs to a separate run against
that app.

Do not include non-Spernakit apps in scope (the fleet manifest defines membership). If a release
fails after tagging, preserve the published tag and fix forward with the next version.
