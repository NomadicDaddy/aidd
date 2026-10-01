---
title: 'Testing Strategy, Coverage, and Verification Audit'
last_updated: '2026-10-01'
version: '2.3'
category: 'Quality'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Testing Strategy, Coverage, and Verification Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

This audit verifies that the **Spernakit canonical verification strategy** is correctly implemented: `smoke:qc` as the quality gate, `crawltest` as the end-to-end page/interaction test, and `supertest` as the full cross-environment validation chain.

## Table of Contents

1. [Architectural Rule - No Unit Test Frameworks](#architectural-rule---no-unit-test-frameworks)
2. [Audit Objectives](#audit-objectives)
3. [Scope](#scope)
4. [Pre-Audit Setup](#pre-audit-setup)
5. [Relationship to Other Audits](#relationship-to-other-audits)
6. [Methodology](#methodology)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)
9. [Deliverables](#deliverables)

## Architectural Rule - No Unit Test Frameworks

Per the target repository's `docs/template/STACK.md` (Verification Strategy) and local `AGENTS.md`
(Testing):

> Spernakit does **not** use unit test frameworks. Do **not** add `vitest`, `jest`, `@testing-library`, `mocha`, `chai`, `cypress`, `playwright-test`, or similar. `crawltest` verifies features end-to-end in the running application.

Introducing a **third-party** unit-test or component-test framework **dependency** (`vitest`, `jest`, `@testing-library`, `mocha`, `chai`, `cypress`, `playwright-test`, or similar) into a Spernakit or Spernakit-derived application is a **Critical** finding (architectural violation). The Critical severity is tied to the presence of the framework **dependency in `package.json`**, not merely to the presence of `.test.ts` files or `describe`/`it`/`expect` symbols. The only permitted test infrastructure is:

- `scripts/smoke.ts` (quality-gate orchestrator)
- `scripts/crawltest*.ts` (Puppeteer-based end-to-end crawler)
- `scripts/check-auth-reset-*.ts` (integration scripts)
- Any ad-hoc integration scripts that do **not** depend on a test runner

Dependencies that legitimately appear: `puppeteer` (crawltest runtime), `supertest` (npm script name - not the library; see `package.json` scripts). The npm package named `supertest` (HTTP assertion library) is **not** used and should not be installed.

### Permitted-Runtime Carve-Out - Bun built-in `bun:test`

The Bun runtime ships a built-in test runner (`bun test`, importing from `bun:test`). This is a **runtime built-in, not a third-party dependency**, so it does **not** violate the no-test-framework rule. Some Spernakit-derived apps deliberately opt into it - notably **aidd itself** (`[typescript+spernakit-web]` profile), which uses `"test": "bun test"` with `test/backend/*.test.ts` files for backend-internal logic (app-launcher, director, db-worker, mcp-server, etc.).

When evaluating a repo:

- Finding `.test.ts` files, `bun test` scripts, or `describe(`/`it(`/`expect(` calls is **NOT** a violation when those tests import from `bun:test` and **no** third-party test-runner dependency is installed.
- The generic "no unit tests of any kind" expectation applies to base Spernakit apps; it does **not** apply to apps (such as aidd) that have intentionally adopted `bun:test`. Do not flag their Bun tests as architectural violations.

### Applicability - local-tool / no-Docker targets (aidd-class)

For single-user local tools with no container build (e.g. **aidd**: `smoke:qc` + crawltest present, but **no `supertest` script and no Dockerfile/compose**), the `supertest` full-chain checks ([Section 4](#4-verify-supertest-full-chain)) and the `smoke:docker-prod` stage are **N/A** - their absence is structural, not a coverage gap. Mark them N/A (state it once), never as a High finding for a chain the app cannot have. For these apps the **primary** verification surface is the Bun built-in suite (`bun test` over `test/{backend,cli,frontend,integration}`) **plus** crawltest for the web panel; assess coverage against that combined surface and do not treat the absence of a docker-prod / multi-environment chain as a hole. The full crawltest + `supertest` chain remains mandatory for containerized Spernakit fleet apps.

## Audit Objectives

- Confirm `bun run smoke:qc` is the single pre-commit quality gate and passes cleanly
- Confirm `crawltest` discovers and visits every route in `frontend/src/routes.tsx`
- Confirm `supertest` chain runs across dev, docker-local, docker-prod, and screenshots
- Identify architectural violations (unit test frameworks, dismissed lint warnings, bypassed checks)
- Verify screenshot, Web Vitals, console-error, and interaction coverage in crawltest
- Verify API contract (`check:api-types`), feature integration (`check:feature-integration`), and schema parity (`check:schema-parity`) gates are wired

## Scope

**In scope**:

- The repo's smoke orchestrator (`scripts/smoke.ts` + `scripts/smoke.json`, `scripts/smoke-qc.ts`, `scripts/smoke-cache.ts`, or equivalent)
- The `crawltest*` script family - note that the entrypoint and module layout vary by app: spernakit ships `scripts/crawltest.ts` + `crawltest-analyze.ts`, while aidd has split it into `crawltest-run.ts` and `crawltest-analyze.ts`. Enumerate the actual `crawltest*` package.json scripts (e.g. `crawltest`, `crawltest:analyze`, `crawltest:bug`, `crawltest:page`) rather than assuming a single entrypoint
- Integration scripts under `scripts/` (e.g. `check-auth-reset-*.ts`, `verify-compression.ts`)
- `package.json` scripts: `smoke:qc`, `smoke:dev`, `smoke:preview`, `smoke:docker-local`, `smoke:docker-prod`, `smoke:screenshots`, `smoke:reset`, `supertest`, `crawltest*`
- `config/{slug}.json` `testing.*` block (crawl credentials, seed routes, depths, delays)
- `tester/` screenshot baseline directory (if present)
- Per-route coverage against `frontend/src/routes.tsx` and backend routes in `backend/src/create-api-app.ts`

**Out of scope** (covered by other audits):

- Static analysis - see [HYGIENE.md](./HYGIENE.md)
- Linting, ordering, comment quality - see [CODE_QUALITY.md](./CODE_QUALITY.md)
- Feature reachability / route wiring - see [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md)
- Performance / Web Vitals thresholds - see [PERFORMANCE.md](./PERFORMANCE.md) and [LIGHTHOUSE.md](./LIGHTHOUSE.md)

## Pre-Audit Setup

### Required Artifact Files

Consult these before forming findings; they anchor what "tested" means for this project:

- `/.aidd/testing-scenarios.md` - declared end-to-end verification scenarios. Coverage findings should cite specific scenarios that are absent from `crawltest`/`scripts/` rather than abstract "missing tests".
- `/.aidd/assertions.md` - invariants that must hold under verification. A behavioral or security assertion without any `crawltest`/integration-script enforcement is a high-priority gap.
- `/.aidd/features/*/feature.json` - per-feature acceptance criteria. Cross-check `tests`, `manualTests`, and `passes` fields against the actual verification surface; features marked `passes: true` without a matching verification step are findings.

## Relationship to Other Audits

| Concern                           | TESTING covers                           | Specialized audit                                  |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Does `smoke:qc` run & pass?       | Yes - gate execution and pipeline shape  | -                                                  |
| Does every route get crawled?     | Yes - crawltest coverage vs `routes.tsx` | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) |
| Lint / format / typecheck quality | No - only "does gate run"                | [CODE_QUALITY.md](./CODE_QUALITY.md)               |
| Dead code / duplicates / orphans  | No                                       | [HYGIENE.md](./HYGIENE.md)                         |
| Web Vitals thresholds / budgets   | No - only "are they captured"            | [PERFORMANCE.md](./PERFORMANCE.md)                 |
| Visual regression / UI parity     | Screenshot capture only                  | [UI_PARITY.md](./UI_PARITY.md)                     |

## Methodology

### 1. Inventory the Verification Surface

Capture the current state:

- List every script in `scripts/` that is a verification entrypoint
- Enumerate `package.json` scripts starting with `smoke:`, `crawltest`, `check:`, `check-`
- Enumerate the **full `crawltest*` script set** (e.g. `crawltest`, `crawltest:analyze`, `crawltest:bug`, `crawltest:page`) - do not assume a single `scripts/crawltest.ts` entrypoint. The run/analyze responsibilities may be split across separate files (`crawltest-run.ts` + `crawltest-analyze.ts` in aidd). Locate the JSON results file by inspecting the run script; the path differs across apps
- Read the repo's smoke source and list the `smoke:qc` step chain. For Spernakit, read `scripts/smoke.json` mode `qc`; for aidd, read `scripts/smoke-qc.ts` `SMOKE_QC_STEPS`.
- Read `config/{slug}.json` `testing.*` block for crawl login, depth, timeout, delays, seed routes

### 2. Verify `smoke:qc` Pipeline Shape

`smoke:qc` is a **check-only** quality gate: it must **never write** to the working tree. The repair counterpart is the separate `qc:fix` command (`lint:fix` + `format` + `smoke:qc`). The gate therefore uses the read-only `lint` and `format:check` steps - **not** the writing `lint:fix` / `format` variants.

**Do not freeze a step count in this audit.** The canonical pipeline is the repo's live `smoke:qc` implementation; `STACK.md`'s Quality Gate Pipeline prose is a secondary reference that can lag. Verify the repo's `smoke:qc` against the **current implementation** rather than a snapshot baked here.

At minimum, a Spernakit-family `smoke:qc` gate should be check-only and cover the relevant structural, type, lint, build, feature-integration, schema/config, formatting, and dependency checks for that repo. App-specific variants may add checks such as `bun test`, standalone binary validation, audit-artifact hygiene, process-env access, max-lines, lockfile freeze, or LTS-surface gates. Those additions are valid when they are read-only and documented by the live step list.

Flag any **missing expected step**, **reordered step that changes required dependencies**, **write-capable step** (`lint:fix`, `format`) in the check-only gate, or **step added without justification** as **High**. Re-read the live smoke source before judging shape - the step list evolves, and a correct pipeline must not be penalized for differing from stale prose.

#### Classifying a Red Gate

This rule applies to every gate this audit runs or reads (`smoke:qc`, `crawltest`, `supertest`, the integration scripts). A gate that exits non-zero is a **code failure** unless the auditor shows otherwise. Class it **environmental** only when both of these are recorded:

- **A named mechanism**: the specific missing service, tool, or OS condition that stopped the gate. Examples: a database that refuses connections on its configured port, a required runtime or CLI that is not installed, a server that did not start inside the gate's timeout. "Flaky", "passes elsewhere", and "probably the environment" are not mechanisms.
- **Evidence**: the quoted error line, plus the check that ties it to the mechanism (the failed service probe, the missing binary, or the same step passing once the condition is supplied).

If the mechanism lives in the repository - a dependency the gate uses but the manifest does not declare, or a script that only works in one shell on a project that supports several - it is a code failure and a finding, even though it first looks environmental.

An environmental failure is reported as a **hold**, never as a pass:

- Record the gate, the mechanism, the evidence, and what must be supplied to re-run it.
- Report its status as `HELD (environmental)`. Do not count it in pass totals and do not leave it out of the report.
- Treat everything that gate would have checked as unverified. Per the methodology gate, output from a gate that did not run cannot be cited or scored.

Flag a red gate recorded as passing, waived, or environmental without a named mechanism and evidence as **High** (bypassed check).

### 3. Verify `crawltest` Coverage

Run `bun scripts/crawltest.ts --mode dev --screenshot-pages` and confirm:

- Every route in `frontend/src/routes.tsx` appears in `results.visitedUrls` in `logs/crawltest.json`
- Every authenticated and unauthenticated route reachable via discovery is exercised
- Interactive elements (buttons, switches, selects, dialog triggers) are clicked per page
- Console errors, console warnings, network errors, and page errors are captured
- Web Vitals (LCP, FCP, CLS, INP, TTFB) are captured per route
- `--404` flag verifies the 404 route renders correctly
- `--bug` flag verifies the bug-report submission path
- Screenshots are written to `screenshots/v{version}[-sv{spernakit_version}]/` (versioned subdirectory)
- The `tester/` directory (if used) is cleared before each run and screenshots are regenerated

Flag gaps:

- Untested route in `routes.tsx` → **High** (coverage hole)
- Missing `--404` verification → **Medium**
- Missing Web Vitals capture on a route → **Medium**
- Crawltest login credentials not present in `config/{slug}.json` `testing.crawlLoginEmail`/`crawlLoginPassword` for apps that require auth → **High**

#### Viewport Coverage

Route coverage and Web Vitals capture do not show which screen sizes were checked. Every piece of visual or acceptance evidence this audit produces or relies on (crawltest screenshots, manual browser verification, recorded `manualTests` results) must state the **mode** (desktop, tablet, or mobile) and the **viewports actually checked**.

- The target's own stated viewport policy wins. Look for it in the project's agent-instruction file and its testing docs.
- Where the target states none, use this default desktop set: `2250x1309` (primary), `2560x1440`, `1920x1200`, `1440x900`. Tablet (`1024x768`, `768x1024`) and mobile (`390x844`, `360x800`) are checked only when they are in scope for the target or the change.
- A desktop-only check does not establish mobile coverage. A single-viewport check does not establish coverage of the rest of its set.
- Read the viewport the crawl script actually sets instead of assuming one. A screenshot whose dimensions do not match the stated viewport is not evidence for that viewport.

Flag gaps:

- Visual or acceptance evidence with no stated mode and viewports → **Low**
- A coverage claim for a mode or viewport that was not checked (for example responsive or mobile behavior passed from a desktop-only run) → **Medium**

### 4. Verify `supertest` Full Chain

`bun run supertest` in spernakit chains (per `package.json`):

1. `smoke:reset` - reset packages + DB + QC
2. `smoke:docker-prod` - production Docker stack + crawltest
3. `smoke:screenshots` - dev crawltest with screenshot capture

Verify the **actual `supertest` script in `package.json`** rather than relying on prose: STACK.md describes the chain as "reset + dev + docker-local + docker-prod + screenshots", but the concrete environments and stages vary by app. Confirm the chain runs cleanly and that each wired environment exercises the same crawl surface. Flag missing environments or skipped stages **relative to that app's own `supertest` definition** as **High**.

### 5. Verify Screenshot Lifecycle

**Applicability gate**: This section applies only **if the app's crawltest is configured for screenshot capture** (e.g. a `--screenshot-pages` / `smoke:screenshots` flow with a screenshot baseline). Apps without a screenshot baseline are **not** penalized for the items below - skip the section and note "screenshot capture not configured".

For apps that do capture screenshots, per project convention:

- `screenshots/tester/` (or the app's equivalent baseline dir) is cleared before each run
- Every page produces a screenshot; count ≈ route count (± sub-tab screenshots)
- Pre-login pages (e.g. `/register`) are screenshotted before login
- Sub-tabs (in-page view switchers) produce additional screenshots

Flag missing **whole-page** screenshots as **Medium**. Flag missing **sub-tab** or **pre-login** screenshots as **Low** (these are app-specific conventions, not universal). Flag a stale baseline (older than the most recent feature-affecting commit) as **Low**.

### 6. Verify Architectural Compliance

Grep the repo for forbidden dependencies and configurations:

```bash
# Should return ZERO matches in package.json
grep -E '"(vitest|jest|@testing-library|mocha|chai|cypress|playwright)"' package.json

# Should return ZERO vitest/jest config files
ls -1 vitest.config.* jest.config.* 2>/dev/null
```

Any match in `package.json` → **Critical** (architectural violation). Create a remediation feature with `auditSeverity: "Critical"` and spec steps to uninstall the framework, delete its config, and migrate any existing tests into `crawltest` interaction coverage or dedicated integration scripts.

**Tie Critical severity to the dependency grep, not to file/symbol presence.** The presence of `.test.ts`/`.spec.ts` files or `describe(`/`it(`/`test(`/`expect(` calls is, on its own, **not** a violation - Bun's built-in `bun:test` runner (imports from `bun:test`) is permitted and is in deliberate use by some apps (e.g. aidd). Only flag test files/symbols when they are backed by a **third-party** test-runner dependency in `package.json`.

Therefore:

- `.test.ts`, `.spec.ts`, or `__tests__/` directories backed by a third-party runner dependency → **Critical**
- `.test.ts` files importing from `bun:test` with **no** third-party runner installed → **permitted, not a finding**
- `describe(`/`it(`/`test(`/`expect(` calls sourced from `bun:test` → permitted; only those sourced from a forbidden third-party runner are violations

### 7. Verify Integration Scripts

Confirm the following scripts exist and are referenced from `smoke.json` or `package.json`:

- `scripts/check-auth-reset-api.ts` - password reset API endpoint verification
- `scripts/check-auth-reset-ui-dev.ts` - password reset UI in dev
- `scripts/check-auth-reset-ui-preview.ts` - password reset UI in preview
- `scripts/verify-compression.ts` - Gzip/Brotli verification

Missing script referenced in `smoke.json` → **High** (broken smoke chain).

### 8. Manual UI Verification Expectation

For frontend/UI changes, the project convention requires browser verification before merge. Confirm the project has:

- A documented workflow, in `DEVELOPMENT.md` or the project's agent-instruction file (`AGENTS.md`, or `CLAUDE.md` where a project uses that), for running crawltest against affected pages after UI changes: `bun scripts/crawltest.ts --page <route>` or `--start-from <prefix>`
- A discoverable pointer from that same file to any browser-testing skill or workflow the project uses (for example a `tester` or `dogfood` skill), if applicable. Check that the pointer resolves; do not assume a skill directory

A documented workflow is not enough on its own. Browser verification evidence, whether the project's or the auditor's, must meet these properties:

- **Driver named**: every verification report names the browser driver that produced it
- **Independent confirmation**: a claim that an interaction did or did not work, and any blocker, is confirmed with a second, independent driver or a real browser before it is filed. Appearance findings need no second driver. When two drivers disagree, a real browser decides
- **Known-positive control**: a claim that something is absent (an element, a request, an error) is valid only after the same driver has detected a comparable thing known to be present on that target. Two drivers that are blind in the same way agree, so agreement counts only once each has passed that control
- **Viewports stated**: the report states the mode and viewports checked, per [Viewport Coverage](#viewport-coverage)

Flag gaps:

- Missing documented manual verification workflow → **Low**
- Verification report that does not name its driver → **Low**
- Interaction claim or blocker filed on one driver's word, or an absence claim with no known-positive control → **Medium** (the evidence is unverified; re-check before relying on it)

## Audit Checklist

### Critical Checks 🚨

- [ ] `package.json` contains zero **third-party** unit-test-framework dependencies (vitest, jest, @testing-library, mocha, chai, cypress, playwright-test)
- [ ] No `vitest.config.*`, `jest.config.*`, or equivalent files exist
- [ ] Any `.test.ts`/`.spec.ts` files or `__tests__/` directories are NOT backed by a third-party runner (Bun built-in `bun:test` is permitted, e.g. aidd)
- [ ] `bun run smoke:qc` passes on a clean checkout
- [ ] `bun run crawltest` discovers and visits every route in `frontend/src/routes.tsx`

### High Priority Checks

- [ ] `smoke:qc` pipeline matches the current repo-specific implementation (read-only `lint` + `format:check`, never `lint:fix`/`format`); no skipped or bypassed steps
- [ ] `check:api-types` is present in the pipeline (OpenAPI ↔ frontend types)
- [ ] `check:feature-integration` is present (features wired end-to-end)
- [ ] `check:schema-parity` is present (Drizzle ↔ DB)
- [ ] `bun run supertest` chain runs every stage declared in the app's own `package.json`, or is marked N/A with a documented local-tool/no-Docker rationale
- [ ] Crawltest login credentials configured in `config/{slug}.json` (for auth-required apps)
- [ ] `scripts/check-auth-reset-*.ts` integration scripts exist and are wired into smoke modes
- [ ] Every route in `routes.tsx` shows up in `logs/crawltest.json` `visitedUrls`
- [ ] Every red gate is classed as a code failure, or as environmental with a named mechanism and evidence; environmental holds are reported as holds and never counted as passes

### Medium Priority Checks 📋

- [ ] Crawltest captures Web Vitals (LCP, FCP, CLS, INP, TTFB) on every route
- [ ] Crawltest `--404` path passes
- [ ] Crawltest `--bug` path passes (if app has bug reporting)
- [ ] Console errors and network errors are asserted zero on clean crawls (ignoring known patterns in `IGNORED_WARNING_PATTERNS`)
- [ ] Screenshots are written to versioned `screenshots/v{version}[-sv{spernakit_version}]/` (if screenshot capture is configured)
- [ ] No coverage is claimed for a mode or viewport that was not checked (a desktop-only check does not establish mobile coverage)
- [ ] Interaction claims and blockers are confirmed with a second, independent driver or a real browser; absence claims follow a known-positive control

### Low Priority Checks 💡

- [ ] `DEVELOPMENT.md` or the project's agent-instruction file documents the targeted crawl workflow (`--page`, `--start-from`)
- [ ] Visual and acceptance evidence states the mode and the viewports actually checked
- [ ] Every browser verification report names the driver it used
- [ ] Sub-tab screenshots are captured for in-page view switchers (if screenshot capture is configured)
- [ ] Pre-login pages (`/register`, etc.) are screenshotted before login (if screenshot capture is configured)
- [ ] Screenshot baseline (`tester/` or similar) is regenerated after feature-affecting changes
- [ ] `smoke-cache.json` is git-ignored and not committed
- [ ] `logs/crawltest.json` is git-ignored and not committed
- [ ] Config `testing.*` defaults (depth=3, timeout=30000, interactionDelay=400, pageSettleDelay=500, contentMinLength=50) are appropriate for the app's route count

## Report Template

```markdown
# Testing Audit Report - YYYY-MM-DD

## Executive Summary

- Architectural Compliance: [PASS / FAIL - any unit-test frameworks found?]
- `smoke:qc` Status: [PASS / FAIL / HELD (environmental) / NOT RUN]
- Crawltest Route Coverage: [N of M routes, %]
- Supertest Chain Status: [PASS / FAIL / PARTIAL / HELD (environmental)]
- Environmental Holds: [none / count - each listed below with its mechanism]
- Critical Gaps: [List]

## Detailed Findings

### Architectural Compliance

- Forbidden dependencies detected: [none / list]
- Forbidden config files detected: [none / list]
- Forbidden test files detected (third-party-runner-backed only; `bun:test` permitted): [none / count + examples]

### smoke:qc Pipeline

- Pipeline shape matches current repo-specific smoke implementation: [yes / no - diff]
- Any bypassed or skipped steps: [none / list with justification]

### Red Gates and Environmental Holds

| Gate   | Class                | Mechanism                               | Evidence                     | Needed to re-run |
| ------ | -------------------- | --------------------------------------- | ---------------------------- | ---------------- |
| [gate] | [code/environmental] | [missing service, tool or OS condition] | [quoted error + tying check] | [what to supply] |

### Crawltest Coverage

- Routes in `routes.tsx`: N
- Routes visited in latest `logs/crawltest.json`: M
- Uncovered routes: [list]
- Web Vitals captured per route: [yes / no / partial]
- Console/network errors on clean run: [count]
- Mode and viewports actually checked: [mode - list of viewports; source of the policy used]

### Browser Verification

- Driver(s) used: [name each]
- Interaction claims and blockers confirmed by a second driver or a real browser: [yes / no / none filed]
- Known-positive control run before each absence claim: [yes / no / none filed]

### Supertest Chain

- `smoke:reset`: [status]
- `smoke:docker-prod`: [status]
- `smoke:screenshots`: [status]

### Integration Scripts

- Auth reset API: [present / wired / missing]
- Auth reset UI (dev/preview): [present / wired / missing]
- Compression verification: [present / wired / missing]

### Screenshot Lifecycle

- Versioned directory used: [yes / no]
- Pre-login screenshots captured: [yes / no]
- Sub-tab screenshots captured: [yes / no / N/A]
- Tester baseline freshness: [current / stale / not used]

### Recommendations

- Immediate (Critical): [architectural violations to remove]
- Short-term (High): [pipeline gaps, coverage holes]
- Long-term (Medium/Low): [documentation, baseline refresh]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

The audit should produce:

- Testing audit report at `.aidd/audit-reports/TESTING-YYYY-MM-DD.md`.
- Verification-surface inventory covering `smoke:*`, `crawltest*`, `check:*`, `check-*`, and integration scripts.
- `smoke:qc` parity record showing the live step source and whether the gate is check-only.
- Red-gate classification table, with a named mechanism and evidence for every environmental hold.
- The mode and viewports actually checked, and the driver(s) used for any browser verification.
- Route/crawl coverage summary with any uncovered routes or missing scenario/assertion coverage.
- Feature JSON remediation files for confirmed Critical/High/Medium findings.
