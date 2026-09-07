# Bug / Feature Request Triage

Convert reports returned by a project's bug intake into actionable `.aidd/features/` entries.
Investigate the affected code, classify each report, and generate precise, verifiable feature
specifications without modifying report storage.

## Contents

- [Usage](#usage)
- [Definitions](#definitions)
- [Discover and load submissions](#phase-1-discover--load-submissions)
- [Learn the codebase](#phase-2-learn-the-codebase-lightweight)
- [Triage submissions](#phase-3-triage-each-submission)
- [Write the triage report](#phase-4-triage-report)
- [Write feature files](#phase-5-write-feature-files)
- [Assign the roadmap](#phase-5b-roadmap-assignment-mandatory)
- [Verify](#phase-6-verification)
- [Decision guidelines](#decision-guidelines)
- [Anti-patterns](#anti-patterns-to-avoid)

Each report carries a `kind` field (`'bug'` or `'feature'`). The kind controls which triage flow is
applied and which feature.json naming convention is used:

- `kind: 'bug'` → root-cause triage → `remediation-{YYYYMMDD}-{slug}`, the non-standalone
  process-record shape, in every repository including derived applications
- `kind: 'feature'` → capability triage → `{slug}` feature.json with acceptance-criteria spec (clean descriptive slug, no prefix or date)

## Usage

```
bug2feature [app-name] [--report-ids <comma-separated-ids>]
```

If no app name is provided, infer it from the current repository or use the sole eligible
application listed in `<applications-root>/AGENTS.md`. If multiple candidates remain, return a usage
error with the candidate list. When report IDs
are supplied, retrieve the complete collection from the intake but triage only those IDs; report any
requested ID that is not returned.

## Definitions

- **Submission**: One report record returned by the project's intake, representing either a bug
  report or feature request
- **Report identity**: The pair `{app-name}:{id}`, where `{id}` is whatever stable identifier the
  intake assigns (a database row number, an issue number, a heading). IDs are unique only within
  one application and one intake; never deduplicate fleet reports by bare ID alone
- **Request kind**: The report's `kind`: `'bug'` for a defect or `'feature'` for an enhancement
- **Actionable submission**: A report whose returned `status` is `"open"` or `"in_progress"`; skip
  `"resolved"` and `"closed"`
- **Triage (bug)**: Reading the affected codebase area (from `metadata.pathname` / `metadata.url`) and determining root cause, severity, and category
- **Triage (feature)**: Reading the domain area the reporter was working in to pick a category and compose acceptance criteria for the requested capability
- **Bug feature**: A feature.json describing what must be verified to confirm a bug is fixed. Use
  the `remediation-{YYYYMMDD}-{slug}` process shape in any repository, derived applications
  included: the prefix marks a non-standalone finding, not a template-owned one.
- **Feature request**: A feature.json with `id` matching `{slug}` (clean descriptive slug, no prefix or date) that describes what must exist and behave correctly for a new capability to be considered complete
- **Duplicate**: An existing `.aidd/features/` entry whose description, affected path, or root cause already covers this submission

## Instructions

### Phase 1: Discover & Load Submissions

1. **Identify the target application** from the argument, current repository, or sole eligible candidate
2. **Locate the application** at `<applications-root>/{app-name}/`
3. **Determine the intake** the project actually uses, in this order. Stop at the first that
   yields reports, and name the chosen intake in the triage report.

    | Intake                    | How to detect it                                                     | Retrieval                                                |
    | ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
    | Reports supplied directly | The user passed a file, a list, or pasted report text                | Read them; the user's list is the complete collection    |
    | In-app report API         | A bug-report route in the backend, plus a reporting UI               | Paginated authenticated retrieval (steps 4-6)            |
    | Issue tracker             | A git remote on a hosted forge, with open issues                     | `gh issue list --state open --json ...` or the forge CLI |
    | Testing run findings      | A `tester` run in this session recorded findings it could not file   | Take them from the run results                           |
    | Local intake file         | A committed inbox the project maintains (for example `.aidd/inbox/`) | Read the files                                           |

    A project with no intake at all is not an error: report "no bug intake found; nothing to
    triage" and stop. Never invent one, and never write reports into a storage file the project
    does not already maintain.

4. **Establish access** for the chosen intake. For an authenticated API, use the application's
   supported login/session flow and confirm the route shape before retrieval. Never print or
   persist credentials, access tokens, refresh tokens, cookies, or CSRF values. If the app is not
   running, the API returns `401` or `403`, the required session role is unavailable, or the
   response does not match the app's documented contract, stop before triage and before writing
   feature files. Report the blocker and the exact non-secret response evidence. Do not treat
   unavailable retrieval as an empty report list, and do not fall back to a test-data copy or a
   direct database read.

    The current Spernakit contract, for apps that use it, is:

    - `POST /api/v1/bugs` submits an authenticated report to the `bug_reports` table
    - `GET /api/v1/bugs?page={page}&limit={limit}&includeSuperseded=true` lists the complete
      report collection newest first for ADMIN or SYSOP; omitting `includeSuperseded` deliberately
      leaves replaced reports out of both `data` and `total`
    - `GET /api/v1/bugs/{id}` reads one report for its reporter or ADMIN+
    - `PATCH /api/v1/bugs/{id}` changes status for ADMIN+
    - `PUT /api/v1/bugs/{id}/superseded-by` links a correction for its reporter or ADMIN+
    - the list response is `{ data, page, limit, total }`
    - each report includes `id`, `kind`, `status`, `title`, `description`, `metadata`, `createdAt`,
      `updatedAt`, `userId`, nullable `email` and `supersededById`, and `supersedesIds`

    Confirm the target app still exposes this shape rather than assuming it. Another project's
    report API will differ; read its route definition and use what it returns.

5. **Retrieve everything the intake holds.** For a paginated API, page with `limit=100` beginning
   at page 1, using the returned `page` and `limit` values because the service may clamp larger
   limits, and continue until the number of distinct report identities equals `total`. For the
   current Spernakit API, send `includeSuperseded=true`; its default inbox view is intentionally a
   filtered collection and therefore cannot prove complete retrieval. Treat an empty page before
   reaching `total`, a repeated page, an invalid envelope, or a missing ID as an incomplete
   retrieval and stop. For a tracker, page until the query is exhausted. For a file or a supplied
   list, read it whole.
6. **Stabilize and deduplicate the snapshot**:
    - key every record by `{app-name}:{id}` and collapse duplicates returned across pages
    - for a live intake, re-fetch the first page after the traversal
    - if the total or the first-page ID set changed, repeat the traversal once
    - if the collection changes again, stop and report an unstable intake snapshot
    - record the retrieval time, total, page count, and ordered report identities as evidence
    - a static file or user-supplied list cannot drift; note it as a single stable read
7. **Apply any report-ID scope** only after complete retrieval. Fail closed if a requested ID is
   absent. Check existing `.aidd/features/*/feature.json` notes for the same `{app-name}:{id}` before
   investigating it; treat a string as one note, an array as its entries, and missing/null as no
   notes. This prevents duplicate backlog entries without relying on intake mutation.
8. **Filter to actionable submissions**: skip anything the intake marks resolved or closed. With
   Spernakit's `status` field, that means keeping `"open"` and `"in_progress"` and skipping
   `"resolved"` and `"closed"`. With a tracker, keep open issues. With a supplied list, treat every
   entry as actionable unless the user says otherwise.
9. **Partition by kind**: split actionable submissions into two groups:
    - `bugKindItems`: entries with `kind === 'bug'`
    - `featureKindItems`: entries with `kind === 'feature'`

    When the intake carries no explicit kind field, derive it from the report itself: a defect in
    existing behavior is `bug`, a request for behavior that does not exist is `feature`. Section
    3a-bis governs the boundary either way.

10. **Report**:
    - Total reports returned by the intake
    - Reports selected by the optional ID scope
    - Actionable bugs count
    - Actionable feature requests count
    - Already-triaged report identity count
    - Skipped (resolved/closed) count
    - If zero actionable submissions: "No actionable submissions to triage. All entries are resolved or closed.", then stop

**Triage never mutates the intake.** Current Spernakit apps do expose supported status and
supersede-link mutations, but this workflow does not call them: creating backlog records is not
authorization to change report state. Never invent a route, update the database directly, close a
tracker issue, or reset report storage. Leave every report intact and preserve its status. If the
user separately requires reports to be marked processed, use only the intake's documented mutation
surface under that explicit authorization; otherwise report that the intake lacks one.

### Phase 2: Learn the Codebase (Lightweight)

Before triaging individual bugs, build enough context to investigate affected areas intelligently.
The directory names below describe the common client/server layout; map them onto whatever
structure the target actually has. A project with no backend, no frontend, or neither simply skips
the subsection that does not apply.

#### 2a. Project Identity

- Read the project's manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, or equivalent) for
  the name, version, script names, and `spernakit_version` when the field is present
- Read `.aidd/project.md` if present for project-specific directives
- For a Spernakit-derived app, read `.aidd/docs/template/STACK.md` (staged;
  `<spernakit-root>/docs/template/STACK.md` in the spernakit repo) for canonical architectural
  rules. Other projects use their own architecture doc, or none.

#### 2b. Backend Topology

- List the route directory (`backend/src/routes/`) to map route files to domain areas
- List the service directory (`backend/src/services/`) to map service files to domain areas
- List the schema directory (`backend/src/db/schema/`) for the data model inventory
- Identify the route registration file (`backend/src/create-api-app.ts` or `backend/src/app.ts`)
- Note the API prefix convention (`/api/v1/` vs `/api/`)

#### 2c. Frontend Topology

- List the page tree (`frontend/src/pages/`, `src/pages/`, `src/routes/`, or `app/`) to map page
  directories to URL paths
- List the API client modules to map them to domain areas
- Identify the actual route registration files. Current Spernakit apps import pages through
  `frontend/src/routes/lazyPages.ts`, register route objects in
  `frontend/src/routes/routeGroups.tsx` and `frontend/src/routes/settingsRoutes.tsx`, and leave
  `frontend/src/routes.tsx` as the browser-router assembly. aidd registers routes in
  `frontend/src/App.tsx`. Do not assume one layout for other stacks.
- Identify navigation config (sidebar config or nav constants)

#### 2d. Existing Feature Deduplication Index

- Read all `.aidd/features/*/feature.json` files and `.aidd/roadmap.json` when present
- Build three indexes:
    - **Template index**: entries with a `spernakit_version` field. This index is empty for a project that is not template-derived; skip it there. These are template-owned features and must not be modified locally. If a bug or feature request targets code covered by a template feature, the remediation must either be filed as an app-specific feature (if the issue is app-specific drift) or flagged for upstream escalation to the spernakit repo (if the template itself needs fixing).
    - **Bug-feature index**: entries whose notes carry `Bug report:` provenance, plus process
      records whose ID starts with `remediation-`; use both to dedupe new bug-kind triage results.
    - **Feature index**: all other entries, plus roadmap feature mappings, used to dedupe new
      feature-kind triage results against completed features and planned work
- For each indexed entry, note its `description`, `id`, and any URL paths, component names, or domain keywords referenced in its `spec`

Summarize findings as a brief "Codebase Map" used throughout triage.

### Phase 3: Triage Each Submission

For every actionable submission, perform a full investigation before classifying. Process entries
with timestamps by `createdAt` (oldest first); preserve intake order for entries without one.

**Branch by kind:**

- If `submission.kind === 'bug'`: run sections **3a-3h** (the bug flow)
- If `submission.kind === 'feature'`: run sections **3a-feature to 3f-feature** (the feature-request flow) instead; skip 3a-3h entirely

---

## 3a-3h: Bug flow

#### 3a. Locate the Affected Area

From the bug's `metadata`:

- `pathname` / `url`: Identify which frontend page is affected (map to `frontend/src/pages/{domain}/`)
- `reportedBy.username` / `reportedBy.userId`: Note the user context (admin vs regular user)
- `localStorageKeys`: Note active stores (may indicate auth/workspace state issues)
- `userAgent`: Flag browser-specific issues if the same bug appears only in certain agents
- `screenResolution` / `viewportSize`: Flag layout/responsive issues if dimensions are unusual

Then read the relevant files:

- The frontend page component for that pathname
- The frontend API module that page calls
- The backend route(s) that serve those API calls
- The backend service(s) those routes invoke
- Any schema files for affected data models

Do not read files speculatively; only read what is directly relevant to the reported pathname and behavior described.

#### 3a-bis. Scope Reclassification Gate

After locating the affected area in 3a, decide whether the submission describes:

- **(A) Broken behavior in code that exists**: a bug. Continue with the bug flow (3b-3h).
- **(B) Missing capability (code that doesn't exist yet)**: implicitly a feature request, even
  though the user filed it as `kind: 'bug'`. **Reclassify** the submission to `kind: 'feature'`,
  route it through the feature-request flow (`3a-feature` -> `3f-feature`), and use the
  acceptance-criteria template instead of the bug root-cause template. Emit a clean `{slug}`
  directory. Skip 3b-3h entirely for this entry.
- **(C) Bug in template-owned code** (template-derived apps only; cannot arise when the Template
  index from 2d is empty): the affected file or subsystem is covered by a feature with
  `spernakit_version`. If the root cause is in template code that all derived apps share, flag the
  submission as **UPSTREAM** in the triage report with a note: "Root cause is in template-managed
  code (`{template-feature-id}`). Fix should be applied to `<spernakit-root>` and synced via the
  aidd-local spernakit-template-upgrade skill." Still file the bug in the derived app, under the
  usual `remediation-{YYYYMMDD}-{slug}` id, because that app needs the fix now, and add
  `"notes": ["UPSTREAM: root cause is in template feature {id}. Fold fix into spernakit via the
aidd-local consolidate-features skill after verification."]` so the upstream debt is tracked.
  Never set `spernakit_version` on it: that field, not the name, is what makes a resident record
  fail the derived app's process-record guard.

**(C-bis) The app must deliberately differ from the template.** Sometimes the answer is not "fix it upstream" — the app genuinely needs behavior the template should not have (an app-only shell, a domain-specific policy, a deliberate downgrade). Do **not** edit the template-owned feature to record it: `bun run template:sync-features` overwrites template-owned records on every upgrade, so an edit there is an unrecorded fork that the next sync silently deletes. Instead create an **app-owned** feature (a clean descriptive slug, no `spernakit_version` — the sync never touches records absent from the template corpus) whose notes begin with the sibling of the `UPSTREAM:` prefix:

```
"notes": ["DEVIATES: {template-feature-dir} — this app's {behavior} intentionally differs from the template baseline because {reason}."]
```

and which lists the template feature's **directory name** in its `roadmap.json` dependencies:

```json
"features": {
    "{app-owned-slug}": { "milestone": "{target}", "dependencies": ["{template-feature-dir}"] }
}
```

The dependency edge is the machine-readable half: aidd resolves it into the feature records when the run ends, renders it, and the divergence stays visible next to the record it diverges from instead of living in a comment. Directory name, not feature title — `id === <dir>` is an enforced invariant (`check:feature-id-directory`), and the resolver reads directories.

A submission qualifies as (B), missing capability, when **any one** of these signals holds:

1. The reported route does not exist in the target application's actual route registry (for
   current Spernakit apps, `frontend/src/routes/routeGroups.tsx` or
   `frontend/src/routes/settingsRoutes.tsx`; for aidd, `frontend/src/App.tsx`)
2. The reported control (button, dialog, menu item, tab, dropdown option) cannot be located on the existing page even though the page itself loads
3. The reported behavior would require a backend service method that does not exist
4. The reported behavior would require a backend route that does not exist
5. The reported behavior would require a database column, table, or FK that does not exist in `backend/src/db/schema/`
6. The reported behavior is cross-feature integration that was never wired (e.g., "feature X should appear on feature Y's feed" when X is never queried by Y)
7. The bug's spec, if written as a remediation, would consist mostly of "Verify the new X..." rather than "Verify the existing X is fixed..."
8. The bug description uses phrases like "missing", "not implemented", "no UI for", "no way to", or "X does not exist" and 3a confirms that what's missing is in fact missing from the codebase

The signals are independent; one is enough. Two or more is decisive.

**Decision recording.** When you reclassify, record the decision in the triage report under a new "Reclassified to feature-kind" section:

```markdown
### Reclassified to feature-kind ({count} entries)

| #   | Bug ID | Original kind | Trigger signal | New feature ID     |
| --- | ------ | ------------- | -------------- | ------------------ |
| 1   | app:42 | bug           | signal 3       | {descriptive-slug} |
```

The reclassified entries are then processed by the feature flow as if they had been filed with `kind: 'feature'` from the start. Their feature.json `notes` array MUST include a provenance entry: `"Reclassified from kind=bug at triage on {YYYY-MM-DD}: {one-line reason}"`.

**Lean toward reclassification when the evidence shows a missing capability.** A submission about
code that does not exist cannot be fixed as a defect in existing behavior. Process it through the
feature flow instead of leaving it in remediation queries.

**Treat flags as point-in-time observations.** Before resolving a `BLOCKED` or scope-conflict note
from another session, run `git log --oneline -20`, `git status --short`, and a targeted search for
the artifacts named in the spec. Follow the aidd-local `promote-remediation` skill's Git State
Sanity Check before changing or deleting the feature record.

**Do NOT reclassify** when:

- The affected code exists but contains a bug (this is the normal bug case; continue with 3b)
- The affected code exists but is incomplete or stub-quality (this is still a bug; the existing code's behavior is wrong)
- The affected code can't be located at all because the description is too vague (use `NR` in 3b instead: Not Reproducible, distinct from "missing capability")

#### 3b. Root Cause Classification

After reading the affected area, classify the root cause:

| Class              | Code           | Meaning                                                 |
| ------------------ | -------------- | ------------------------------------------------------- |
| Frontend render    | `FE-RENDER`    | Component crash, blank page, wrong state, wrong display |
| Frontend form      | `FE-FORM`      | Validation gap, submit error, field behavior            |
| Frontend routing   | `FE-ROUTE`     | Wrong redirect, protected route leak, 404               |
| API contract       | `API-CONTRACT` | Frontend expects shape backend doesn't return           |
| Backend logic      | `BE-LOGIC`     | Service returns wrong data, wrong business rule         |
| Backend validation | `BE-VALID`     | Missing/wrong input validation allowing bad data        |
| Backend error      | `BE-ERROR`     | Unhandled exception, wrong status code, missing guard   |
| Database           | `DB`           | Schema constraint, missing field, migration gap         |
| Auth/authz         | `AUTH`         | Wrong role required, missing auth guard, token issue    |
| Configuration      | `CONFIG`       | Wrong config value, missing config key                  |
| Not reproducible   | `NR`           | Description too vague to locate affected area           |
| By design          | `BY-DESIGN`    | Behavior is correct; user misunderstood                 |

#### 3c. Severity Assessment

| Severity   | Priority | Criteria                                                            |
| ---------- | -------- | ------------------------------------------------------------------- |
| Critical   | 1        | Data loss, security bypass, auth failure, complete feature breakage |
| High       | 2        | Feature unusable for affected users, broken workflow                |
| Medium     | 3        | Feature degraded but workaround exists, cosmetic with data impact   |
| Low        | 4        | Minor UX issue, cosmetic only, edge case with no data impact        |
| Negligible | 5        | Enhancement request disguised as a bug, by-design behavior          |

#### 3d. Actionability Gate

Before generating a feature.json, confirm:

1. **Root cause is locatable**: The affected code was found and the issue is identifiable (not `NR`)
2. **Not by-design**: The behavior described is genuinely incorrect (`BY-DESIGN` skips feature creation)
3. **Not a duplicate**: No existing `.aidd/features/` entry already covers this exact issue (use the deduplication index from Phase 2d). If a duplicate is found, record which feature covers it; do not create a new entry.
4. **Fixable in-codebase**: The issue is not caused by an external dependency, browser quirk, or environment that cannot be addressed in the application code
5. **Not a known test-harness false positive**: The submission does not describe an artifact of the automation that filed it. Test-harness artifacts are NOT product bugs and must not produce remediations. The catalogued patterns below are the Spernakit ones; for another project, apply the same rule to that project's known harness artifacts.

Bugs that fail the actionability gate are recorded in the triage report but do not produce feature.json files.

##### Known test-harness false positives (DO NOT produce remediations)

These patterns are catalogued for Spernakit and Spernakit-derived apps. If the bug's description or
`metadata.userAgent` strongly suggests it originated from a Spernakit tester, `sb.ts`, or Puppeteer
scripted run and the symptom matches one of the patterns below, skip it. Record the skip in the
triage report's "Skipped: Not Actionable" section with reason
`TEST-HARNESS-FALSE-POSITIVE: <pattern>`. On other projects, use the same reason code for that
project's equivalent artifacts and name the harness in the report.

- **"Radix DropdownMenu / Popover / Dialog trigger does not open when clicked"**. If the report
  predates the 2026-04-15 harness fix, or its evidence explicitly identifies `sb.ts` or the retired
  Spernakit browser CLI, classify it as a legacy harness artifact. Reproduce reports from newer or
  unidentified automation with the current canonical browser workflow before deciding they are
  product defects.
- **"Bug report dialog silently drops 2nd and subsequent submissions in the same session"**. Apply
  the same cutoff and evidence requirements. Reproduce newer reports before classifying them.
- **`metadata.userAgent` contains `HeadlessChrome`**: this is a soft signal, not a block. Combined with one of the symptoms above, it's a near-certain test-harness false positive. Combined with a genuine product symptom (e.g., a 500 from an API call, a schema mismatch), it's still a real bug.

When skipping a test-harness false positive, the triage report entry MUST include:

- The exact symptom phrase matched
- The cutoff or harness evidence that qualifies the report as a historical harness artifact
- A note that the submitter should re-run the same scenario with an up-to-date harness before re-filing

For reports on or after the cutoff without explicit retired-harness evidence, reproduce the symptom
instead of auto-skipping it; a current product regression may share the same symptoms.

#### 3e. Category Mapping

Map the root cause class to the feature.json `category` field:

| Root Cause Class                   | Feature Category |
| ---------------------------------- | ---------------- |
| `FE-RENDER`, `FE-FORM`, `FE-ROUTE` | `"UI"`           |
| `API-CONTRACT`                     | `"Backend"`      |
| `BE-LOGIC`, `BE-VALID`, `BE-ERROR` | `"Backend"`      |
| `DB`                               | `"Database"`     |
| `AUTH`                             | `"Security"`     |
| `CONFIG`                           | `"Core"`         |

Override to `"Security"` if the bug involves auth bypass, data exposure, or role escalation regardless of other classification.

#### 3f. Spec Generation Rules

The `spec` field must be a numbered verification checklist. Each line starts with "Verify". Lines must be concrete: they must name a specific file path, endpoint, component, field, role, or behavior.

Required spec coverage by category:

**UI bug (`FE-RENDER`, `FE-FORM`, `FE-ROUTE`)**:

- Verify the page component exists at `frontend/src/pages/{domain}/{ComponentName}.tsx`
- Verify the specific rendering condition that caused the bug no longer triggers
- Verify the corrected behavior is visible in the UI (describe what is shown)
- Verify the route is registered through the target application's actual router. For current
  Spernakit apps, check the lazy import in `frontend/src/routes/lazyPages.ts` and the route object in
  `frontend/src/routes/routeGroups.tsx` or `frontend/src/routes/settingsRoutes.tsx`;
  `frontend/src/routes.tsx` only assembles those groups.
- If form: verify validation prevents the bad input that triggered the bug

**Backend bug (`BE-LOGIC`, `BE-VALID`, `BE-ERROR`, `API-CONTRACT`)**:

- Verify the route exists at `backend/src/routes/{routeFile}.ts`
- Verify the specific endpoint (`METHOD /api/path`) handles the edge case correctly
- Verify the service method returns the correct shape
- Verify the target stack's request schema rejects the invalid input (for Elysia, the TypeBox
  `t.Object` body/query/params schema) when validation is the gap
- Verify the matching frontend API type module under `frontend/src/api/types/` agrees with the
  backend response shape
- Verify the error response uses the correct HTTP status code and format

**Database bug (`DB`)**:

- Verify the schema file at `backend/src/db/schema/{entity}.ts`
- Verify the specific field, constraint, or index that was missing or wrong
- Verify the project's established development schema command applies without errors

**Auth/authz bug (`AUTH`)**:

- Verify the guard is applied to the affected route
- Verify the role threshold is correct (e.g., OPERATOR+, ADMIN+)
- Verify unauthorized requests return 401, forbidden requests return 403
- Verify the frontend does not expose the protected resource before auth resolves

**Config bug (`CONFIG`)**:

- Verify the config key is present in the target application's actual configuration source
- Verify the value is validated at startup
- Verify the affected behavior uses the corrected value

Spec lines must be specific enough that any developer can verify them without asking questions.

#### 3g. ID and Slug Generation

- **ID format**: `remediation-{YYYYMMDD}-{slug}` for every bug feature, in whichever repository it
  is filed against. The prefix records that the finding is non-standalone, not that the template
  owns it.
- **Date**: Today's date in YYYYMMDD format — the triage date, not the date the bug was reported.
- **Slug**: 2-4 lowercase hyphenated words derived from the bug description. Must be unique across all generated features in this run and all existing features.
- **Directory name**: The full ID, for example
  `.aidd/features/remediation-20260220-dashboard-empty-servers/`.
- **Never set `spernakit_version`** on a record written into a derived application. That field, not
  the name, is what fails the app's process-record guard and what lets `template:sync-features`
  prune the directory.

Examples:

- App bug: "Dashboard crashes when no servers are registered" ->
  `remediation-20260220-dashboard-empty-servers`
- App bug: "Login form accepts blank password" -> `remediation-20260220-login-blank-password`
- Spernakit process finding: "Settings page throws 403 for OPERATOR role" ->
  `remediation-20260220-settings-operator-403`

#### 3h. Handling Multiple Bugs with the Same Root Cause

If two or more bugs share the same root cause (same file, same code path, same defect):

- Create ONE feature.json that covers all of them
- Reference all app-qualified report identities in the `notes` field:
  `["Bug reports: {app-name}:42, {app-name}:57"]`
- Write a spec that covers the full range of symptoms
- Use the higher priority of the group

---

## 3a-feature to 3f-feature: Feature-request flow

#### 3a-feature. Locate the Requested Area

From the submission's `metadata`:

- `pathname` / `url`: Identify which frontend page the reporter was viewing (map to `frontend/src/pages/{domain}/`); this is where the new capability most likely belongs, or the natural surface from which it would be discovered
- `reportedBy.username` / `reportedBy.userId`: Note the user context (admin-only features should be flagged separately from user-facing ones)

Then read just enough to pick a category and compose acceptance criteria:

- The frontend page component the user was on (to understand the domain)
- The frontend API module and backend route that serve that page (to understand the current shape)
- The relevant schema file if the request implies a new data field or entity

Do not run root-cause classification; there is no defect to locate. The purpose of reading here is to ground the acceptance criteria in real filenames and current behavior.

#### 3b-feature. Scope & Category

Pick a category from the same set the bug flow uses: `UI`, `Backend`, `Database`, `Security`, `Core`. The choice reflects where the new work will primarily land.

- New page, new component, new form field → `UI`
- New endpoint, new service method, new business rule → `Backend`
- New column, new table, schema change → `Database`
- New permission, new role behavior, new guard → `Security`
- New config key, new scheduled task, platform-level change → `Core`

If the feature spans multiple categories, pick the one that represents the bulk of the implementation effort and note the cross-cutting nature in the feature `description`.

#### 3c-feature. Priority

Default to **3 (Medium)** for feature requests. Adjust only when the reporter's description explicitly indicates:

- **2 (High)**: Reporter cites a blocked workflow, a workaround that is becoming unsustainable, or a customer commitment
- **4 (Low)**: Reporter describes the request as "nice to have" or "someday"
- **5 (Negligible)**: Request is a minor preference with no broader value

Do not map from bug severity criteria; feature requests are not measured by data loss or breakage.

#### 3d-feature. Actionability Gate (feature variant)

Skip the bug actionability gate entirely. Feature requests are rejected for a narrower set of reasons:

1. **Out of scope**: The request is for a capability that the application is not intended to provide (cross-reference `.aidd/spec.md` or `.aidd/project.md`). If intent remains unclear, preserve the report without creating a feature and record the unresolved product decision.
2. **Duplicate of an existing feature**: The feature index built in Phase 2d already contains a
   standalone entry covering the same capability. Reference it in the triage report; do not create
   a new entry.
3. **Already on the roadmap**: The request is listed in `.aidd/roadmap.json`. Reference the roadmap item; do not create a new feature.json for it.
4. **Unimplementable**: The request conflicts with an established architectural constraint and
   cannot be delivered without a stack change the project explicitly disallows.

Do NOT apply `NR` (not reproducible); feature requests are forward-looking and cannot be "reproduced."
Do NOT apply `BY-DESIGN`; this only applies to bugs that turn out to be correct behavior.

#### 3e-feature. Spec Generation

The `spec` field is a numbered acceptance-criteria checklist. Each line starts with "Verify" and describes a condition that must hold **after the feature ships**. Unlike bug specs (which verify a defect is fixed), feature specs describe the capability's desired end state.

Model the spec after existing standalone entries in the target app itself —
`{app}/.aidd/features/*/feature.json`. Prefer two references from that app: one schema/model feature
and one backend CRUD API feature, so the new spec matches the conventions that app actually uses.
Do not copy the shape from a different app; feature records vary by stack and RBAC tier.

Required spec coverage by category:

**UI feature**:

- Verify the new page/component exists at `frontend/src/pages/{domain}/{ComponentName}.tsx`
- Verify the component renders the expected elements (describe what is shown)
- Verify the component handles its primary interaction (describe what happens on click/submit)
- Verify the route is registered in the target application's actual route registry and reachable
  from a navigation surface when appropriate
- Verify form validation prevents invalid input where applicable

**Backend feature**:

- Verify the new route exists at `backend/src/routes/{routeFile}.ts`
- Verify the endpoint (`METHOD /api/path`) accepts the documented request shape through the target
  stack's validator (TypeBox for Elysia applications)
- Verify the service method implements the documented business rule
- Verify the matching frontend API type module matches the backend response shape
- Verify proper role/auth guards are applied (describe the required role)

**Database feature**:

- Verify the target application's schema file declares the new columns/indexes
- Verify the target application's established database naming convention is followed (current
  Spernakit schemas map camelCase identifiers to snake_case storage names)
- Verify FK relationships and cascade behavior match the spec
- Verify the project's established development schema command applies without errors

**Security feature**:

- Verify the new guard/role/permission is implemented and applied to the right routes
- Verify the affected endpoint returns 401/403 for unauthorized callers
- Verify the audit log records the new action when the application has an established audit trail

**Core feature**:

- Verify the config key is present in the target application's actual example/default
  configuration surface and validated at startup
- Verify the behavior toggled by the config key takes effect without restart where applicable

Spec lines must be specific enough that any developer can verify them without asking questions. Name concrete files, endpoints, fields, and expected behaviors.

#### 3f-feature. ID and Slug Generation

- **ID format**: `{slug}`, a clean descriptive kebab-case slug with NO prefix and NO date stamp
- **Slug**: 2-4 lowercase hyphenated words derived from the feature description. Must be unique across this run and all existing features.
- **Directory name**: The slug itself (e.g., `.aidd/features/board-csv-export/`)

Examples:

- Request: "Let me export my board as CSV" → `board-csv-export`
- Request: "Add dark mode to the login screen" → `login-dark-mode`
- Request: "I want email notifications when a card is assigned to me" → `card-assignment-email`

### Phase 4: Triage Report

After investigating all submissions, present a structured triage report, then proceed directly to writing the files (Phase 5); no approval gate in directive mode.

```markdown
## Bug & Feature-Request Triage Report: {app-name}

**Application**: {app-name} {version} — add `(spernakit v{spernakit_version})` only when the field exists
**Intake**: {chosen intake}
**Reports returned**: {total} | **Selected**: {selected} | **Actionable bugs**: {bugCount} | **Actionable feature requests**: {featureCount} | **Already triaged**: {alreadyTriaged} | **Skipped**: {skipped}
**Retrieved**: {retrievedAt}{ across {pageCount} page(s) when the intake is paginated}
**Date**: {today YYYY-MM-DD}

---

### Bug Fixes to Create ({bugCreateCount} files)

| #   | Bug ID | Description (truncated) | Root Cause | Category | Priority | Feature ID       |
| --- | ------ | ----------------------- | ---------- | -------- | -------- | ---------------- |
| 1   | app:42 | {first 80 chars}        | FE-RENDER  | UI       | 2        | {bug-feature-id} |

#### Detail: {feature-title} (`{feature-id}`)

- **Bug**: `{app-name}:{bug.id}` submitted {bug.createdAt} by {reporter}
- **Affected path**: `{metadata.pathname}`
- **Root cause**: {class}: {1-2 sentence explanation of what was found in the code}
- **Files investigated**: `{file1}`, `{file2}`
- **Priority**: {n} ({severity label})
- **Spec preview**:
    1. Verify ...
    2. Verify ...

---

### Feature Requests to Create ({featureCreateCount} files): clean slugs (no prefix)

| #   | Submission ID | Description (truncated) | Category | Priority | Feature ID         |
| --- | ------------- | ----------------------- | -------- | -------- | ------------------ |
| 1   | app:57        | {first 80 chars}        | UI       | 3        | {descriptive-slug} |

#### Detail: {feature-title} (`{feature-id}`)

- **Submission**: `{app-name}:{bug.id}` submitted {bug.createdAt} by {reporter}
- **Reporter was on**: `{metadata.pathname}`
- **Requested capability**: {1-2 sentence summary}
- **Files investigated**: `{file1}`, `{file2}`
- **Category**: {category}
- **Priority**: {n}
- **Acceptance criteria preview**:
    1. Verify ...
    2. Verify ...

---

### Skipped: Duplicates ({count})

| Submission ID | Kind | Description   | Covered by              |
| ------------- | ---- | ------------- | ----------------------- |
| app:68        | bug  | {description} | `{existing-feature-id}` |

### Skipped: Not Actionable ({count})

| Submission ID | Kind    | Description   | Reason                            |
| ------------- | ------- | ------------- | --------------------------------- |
| app:69        | bug     | {description} | NR: cannot locate affected area   |
| app:70        | bug     | {description} | BY-DESIGN: behavior is correct    |
| app:71        | feature | {description} | Out of scope per app_spec         |
| app:72        | feature | {description} | Already on roadmap as `{item-id}` |

### Skipped: Resolved/Closed ({count})

Not processed (status is resolved or closed).

---

**Writing {n} feature.json file(s).**
```

### Phase 5: Write Feature Files

Proceed to write each feature.json.

#### File location

```
<applications-root>/{app-name}/.aidd/features/{feature-id}/feature.json
```

Where `{feature-id}` is the full ID (e.g., `remediation-20260220-dashboard-empty-servers` or `board-csv-export`).

#### JSON template - bug-kind

```json
{
	"category": "{UI|Backend|Database|Security|Core}",
	"createdAt": "{ISO timestamp at the current time}",
	"dependencies": [],
	"description": "{1-2 sentence description of the bug and what the fix must accomplish}",
	"id": "remediation-{YYYYMMDD}-{slug}",
	"notes": ["Bug report: {app-name}:{bug.id} | Reported: {bug.createdAt} | Path: {metadata.pathname} | Reporter: {reporter}"],
	"passes": false,
	"priority": {1-5},
	"spec": "1. Verify ...\n2. Verify ...\n3. Verify ...",
	"status": "backlog",
	"title": "{concise title describing the fix}",
	"updatedAt": "{same ISO timestamp as createdAt}"
}
```

#### JSON template - feature request (feature-kind)

```json
{
	"category": "{UI|Backend|Database|Security|Core}",
	"createdAt": "{ISO timestamp at the current time}",
	"dependencies": [],
	"description": "{1-2 sentence description of the feature and the value it provides}",
	"id": "{slug}",
	"notes": ["Feature request: {app-name}:{bug.id} | Requested: {bug.createdAt} | Requested from: {metadata.pathname} | Requester: {reporter}"],
	"passes": false,
	"priority": {1-5},
	"spec": "1. Verify ...\n2. Verify ...\n3. Verify ...",
	"status": "backlog",
	"title": "{concise title describing the new capability}",
	"updatedAt": "{same ISO timestamp as createdAt}"
}
```

#### Formatting rules (both templates)

- **Tabs** for indentation (not spaces); matches project convention
- Newlines in `spec` use `\n` escape sequences within the string value
- Run the target project's formatter over each file; current aidd and Spernakit formatting sorts
  JSON keys rather than preserving authoring order
- `dependencies` is always an array (empty `[]` unless the feature requires a prerequisite)
- `notes` is always an array on new writes. When appending to an existing record, normalize
  missing/null to `[]`, a string to `[existingString]`, and an array to a copy; preserve every
  existing string and persist the result as an array.
- Do not add fields not listed above unless a `spernakit_version` field is warranted
- **Never mix templates**: a bug-kind submission uses the root-cause template; a feature-kind
  submission uses the acceptance-criteria template. Naming follows the same axis and no other:
  bug-kind records take the `remediation-` prefix and feature-kind records take clean slugs, in
  every repository.

### Phase 5b: Roadmap Assignment (mandatory)

Feature persistence is **not complete** until every newly written feature.json (bug-kind or
feature-kind) is assigned in `.aidd/roadmap.json`. Phase 2d already reads the roadmap for dedupe;
this step makes assignment mandatory, not just a read. After writing the files in Phase 5 and
before the Phase 6 verification:

1. Read `<applications-root>/{app-name}/.aidd/roadmap.json`. If it does not exist, **create it first**:
   a single `v1.0` milestone (priority 1) mapping every existing feature directory, preserving
   dependencies (keyed by directory). This is the shape the coding runtime auto-creates on first run —
   roadmap and milestones apply to every project, so a missing file is created, never skipped — then
   continue with the assignment below.
2. For each feature created in Phase 5, set `roadmap.features["{feature-id}"] = { "milestone": "{target}" }` (merge; preserve any existing `dependencies` on that key). The target milestone depends on the feature kind:
    - **Bug-kind features**: assign to the **current milestone**: the first milestone in priority
      order with unfinished work, or the last existing milestone when all work is complete. Bug
      fixes must ship in the current version, not be deferred to a future release. Never
      auto-create a new milestone for one.
    - **Feature requests** (clean slug, feature-kind): assign to the future backlog selected by the
      current aidd policy. Reuse an existing empty or later-priority milestone when one exists. On
      an active roadmap with no separate future bucket, create the next `vX.0` milestone after the
      highest versioned milestone. On `lts` or `locked` roadmaps, never create a milestone; use the
      active or last existing milestone. An explicit reporter or owner milestone overrides this
      default when it exists in the roadmap.

    The owner may re-target any feature afterward.

3. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace.

### Phase 6: Verification

After writing all files:

1. **Re-read each written file** and confirm it parses as valid JSON
2. **Confirm no orphaned directories**: each directory has a `feature.json`
3. **Confirm no ID collisions**: no two features share an `id`
4. **Report final summary**:

```markdown
## Write Summary

| Feature ID       | Title           | File                             |
| ---------------- | --------------- | -------------------------------- |
| {bug-feature-id} | {bug-fix title} | .aidd/features/{id}/feature.json |

**{n} feature.json file(s) written successfully.**

Run the aidd-local `feature-review` skill to validate spec quality, or begin implementation with the highest-priority item.
```

## Decision Guidelines

### When to create a feature.json

- Root cause is identified in specific code
- Behavior is clearly a defect (not by design)
- No existing feature already covers the same fix
- The fix is something that can be verified with concrete checks

### When NOT to create a feature.json (bug-kind)

- Bug description is too vague to locate affected code (`NR`)
- Behavior described is correct per the application's design (`BY-DESIGN`)
- A feature already in `.aidd/features/` covers the same root cause
- Bug status is `resolved` or `closed`
- The issue is in an external dependency that cannot be modified in this codebase

### When NOT to create a feature.json (feature-kind)

- Request is out of scope per `.aidd/spec.md` or `.aidd/project.md`
- Request is already covered by an existing standalone entry in `.aidd/features/`
- Request is already listed in `.aidd/roadmap.json` (reference the roadmap entry in the triage report)
- Request requires stack capabilities that do not exist in the application
- Submission status is `resolved` or `closed`

### Priority mapping guidance

- **Priority 1**: Auth bypass, data loss, application crash on load, complete feature unavailable
- **Priority 2**: Feature broken for a specific user role, incorrect data shown, form submission silently fails
- **Priority 3**: Feature works but degraded UX, incorrect display that doesn't affect data, workaround available
- **Priority 4**: Minor visual glitch, cosmetic misalignment, non-critical edge case
- **Priority 5**: Purely cosmetic with no user impact, preference disagreement, out-of-scope request

When a bug is reported by a user with elevated role (ADMIN, SYSOP) for an admin-only feature, treat it as at least Priority 2 because admin tool breakage blocks management tasks.

### Duplicate detection heuristics

An existing feature is a duplicate if ANY of the following are true:

- Its `description` mentions the same page path and the same symptom
- Its `spec` contains "Verify" lines targeting the same file and the same behavior
- Its `id` or `title` describes the same root cause

When overlap remains ambiguous, preserve the existing feature set and record the unresolved overlap.

## Anti-Patterns to Avoid

- Do not create feature.json files for resolved/closed submissions
- Do not read from, reset, or recreate a storage file the intake does not use. In a Spernakit app
  current reports live in the database behind the authenticated API, so `data/bugs.json` is stale
  or absent; read it in no project unless that project's intake is that file.
- Do not mutate the intake's storage directly — the `bug_reports` table, a tracker's issues, or an
  inbox file — and do not invent report update or delete endpoints
- Do not continue after partial, unauthorized, forbidden, or unstable retrieval
- Do not read the entire codebase speculatively; only read files directly relevant to the affected pathname
- Do not write vague spec lines like "Verify the bug is fixed" or "Verify the page works"
- Do not assign Priority 1 to every bug; severity must be earned by actual impact analysis
- Do not skip the duplicate check; writing a bug fix or feature for something already covered wastes effort
- Do not fabricate root causes; if you cannot find the affected code, decide between `NR` (description too vague to locate area) and reclassification to `kind: 'feature'` (area provably doesn't exist) per section 3a-bis. Report honestly.
- Do not create features for `BY-DESIGN` behavior; report it and explain
- Do not use relative paths in spec lines; always use paths from the project root
- Do not collapse multiple distinct bugs into one feature if their root causes differ; they should remain separate
- Use the triage date in a dated process ID, not the date the bug was reported
- **Do not generate `remediation-*` IDs for entries with `kind: 'feature'`**; use a clean descriptive slug (no prefix, no date) and the acceptance-criteria spec template
- **Do not withhold a `remediation-*` ID from a bug because the target is a derived app**; the
  prefix records that the finding is non-standalone, and `resident.ts` judges resident records by
  provenance rather than by name
- **Do not use `feature-YYYYMMDD-` prefix**; base features use clean slugs like `board-csv-export`, not `feature-20260410-board-csv-export`
- Do not apply the `NR` or `BY-DESIGN` gates to feature-kind submissions; those are bug concepts
