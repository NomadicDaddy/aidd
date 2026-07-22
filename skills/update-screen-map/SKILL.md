---
name: update-screen-map
description: "Reconcile `.aidd/screen-map.md` with live routes, navigation, pages, roles, and feature links while preserving narrative text. Use to audit, refresh, or reconcile a Spernakit application's screen map."
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Reconcile the Screen Map

Reconcile a Spernakit-derived application's `.aidd/screen-map.md` against the actual frontend routes,
navigation configuration, page components, and feature blueprints. Detect drift, report it, and apply
evidence-backed updates inferred from code instead of leaving TODO stubs. Preserve hand-written narrative
blocks byte for byte. When a route has no matching `.aidd/features/` blueprint, back-fill one so the
reconstruction blueprint stays complete.

Apply the changes directly. The report and file diff are the review surface.

## Usage

```
update-screen-map [appname]
```

If `[appname]` is omitted, infer it from the current working directory under
`<applications-root>/<app-name>`.

## Context

`.aidd/screen-map.md` is the canonical reference for:

- **Route Map table**: Route → Screen → Primary Purpose → Min Role
- **Screen Details**: per-screen narrative (Purpose, Core Regions, Key Controls)
- **Screen-to-Feature Traceability table**: Screen → `feature-*` drivers in `.aidd/features/`

Identify code sources of truth by **role, not filename**. Apps differ, so discover the route and
navigation modules instead of requiring one repository's filenames.

- **Route definitions** — wherever the router tree is declared. Commonly `frontend/src/routes.tsx`;
  also frequently `frontend/src/App.tsx`, `frontend/src/router.tsx`, or a `routes/` directory.
- **Navigation items** — the sidebar/menu definition. Commonly
  `frontend/src/components/layout/navConfig.tsx`; also `nav-items.ts(x)`, `navigation.ts(x)`, or a
  `nav`/`menu` module under `components/layout/`.
- `frontend/src/pages/**/*.tsx`: page components whose JSX, mutations, and component names define the narrative
- `.aidd/features/*/feature.json`: feature blueprints referenced by the Traceability table

**Access control is optional.** Some apps guard routes by role (`<ProtectedRoute requiredRole="…">`,
`NavItem.minRole`); others have no role model at all. Only emit the Min Role column when the app
actually has one — inventing roles for an app without them produces a map that describes nothing.

**Derive Screen Details narrative from code.** Read the page component, identify major sections from
rendered components and headings, enumerate mutations and dialogs, and write Purpose / Core Regions /
Key Controls from those signals. Preserve existing hand-written content byte for byte, but never emit
a TODO stub when the page code has clear signals.

Where an app defines a role hierarchy, read it from that app rather than assuming one. Spernakit-derived apps use `VIEWER < OPERATOR < MANAGER < ADMIN < SYSOP` (see `frontend/src/types/roles.ts`, re-exported from `spernakit-shared`); apps with no such module have no hierarchy to rank by, and the Min Role column is omitted rather than invented.

## Instructions

### Phase 1: Resolve target app

1. Parse `$ARGUMENTS` for an app name. If empty, infer from `cwd`.
2. Resolve to `<applications-root>/{appname}` (or `<applications-root>/{appname}` under bash). The app table in `<applications-root>/AGENTS.md` is the reference list.
3. Verify `{app}/.aidd/` exists.
4. **Discover the route and navigation sources by role**, in this order — do not require any exact
   filename:
    - Route definitions: try `frontend/src/routes.tsx`, `frontend/src/App.tsx`,
      `frontend/src/router.tsx`, then grep `frontend/src` for the router import in use
      (`createBrowserRouter`, `<Routes>`, `<Route `). The file declaring the route tree is the one.
    - Navigation items: try `frontend/src/components/layout/navConfig.tsx`, then `nav-items.ts(x)`,
      `navigation.ts(x)` anywhere under `frontend/src/components/layout/`, then grep for the array
      the sidebar renders. Navigation may legitimately be absent — an app can route without a menu.

    State the files you resolved in your final report, so the map is traceable to its sources.

5. Note whether `{app}/.aidd/screen-map.md` exists. If not, the skill will create it from scratch using the standard structure: Primary Navigation prose + Route Map table + Screen Details sections + Screen-to-Feature Traceability table. If another app in scope already has a `screen-map.md`, mirror its section order.
6. Stop and report **only** if route definitions cannot be found at all. A missing nav source or a
   missing role model is not a blocker: build the map from routes alone and omit the columns that do
   not apply. Producing a routes-only map is the job; refusing because the app is shaped differently
   is not.

### Phase 2: Extract routes from code

1. Read the route-definition file resolved in Phase 1 fully.
2. Walk the protected route tree (under `<AppShell>` / `<ProtectedRoute />`). **Exclude** public routes: `/login`, `/register`, `/oauth/callback`, `/mfa/*`, `/reset-password*`, `/verify-email`, `/force-password-change`, `/shared/*`, and the `*` NotFound catch-all.
3. For each included route, capture:
    - `path` as written (keep `:id` and other params)
    - Nearest enclosing `<ProtectedRoute requiredRole="X">`; that's the route-level min role (may be undefined)
    - Component name from `element={<LazyPage Component={X} />}`; used to find the page source file
4. Read the navigation source resolved in Phase 1 and collect every nav entry: its path/`to`, label, min role (if the app has one), section group (the heading before the item), `featureFlag` (if any). Skip this step when the app has no navigation source.
5. **Merge** by path. For each route:
    - Screen label ← nav label if present, else prettified component name (e.g. `ProjectDetailPage` → `Project Detail`)
    - Min Role ← nav min role if present, else route-guard `requiredRole`. Omit the column entirely when the app has no role model; never default a role the app does not define.
    - If a nav min role and a route-guard `requiredRole` disagree, record a **mismatch** entry; do not auto-resolve

### Phase 3: Parse existing screen-map.md

If the file exists:

1. Extract rows from the Route Map table: `Route | Screen | Primary Purpose | Min Role`. Note which Primary Purpose cells are `TODO`-ish so Phase 5 can replace them with inferred content.
2. Extract rows from the Screen-to-Feature Traceability table: `Screen | Feature Drivers`. Note TODO / stale cells for replacement.
3. Identify every `### <Screen> (\`/path\`)`header and record its span from that header through the
blank line before the next`###`or`---`. Preserve hand-written, non-TODO sections byte for byte.
A section is hand-written when Purpose, Core Regions, or Key Controls contains substantive text
rather than only `TODO`; Phase 5 may replace TODO-only stubs.
4. Also note the "Primary Navigation" prose paragraph near the top.

If the file does not exist, treat all extracted rows as empty and skip the orphan/stale checks in Phase 4.

### Phase 4: Inference pass - read page code and feature blueprints

This phase gathers the raw signal needed for Phase 5 to produce non-TODO content. For apps with more
than about five new or TODO-stub screens, delegate bounded groups to independent workers when the
active backend supports delegation. Require a compact per-screen record from each worker. Otherwise
perform the pass inline.

For each screen that needs inference (new route, or existing row with a TODO-ish Primary Purpose / Screen Details / Traceability cell):

1. **Locate the page component**: follow the route component name (`element={<LazyPage Component={X} />}`) to the source file under `frontend/src/pages/`. Tabs and nested layouts live under `pages/{domain}/tabs/` or `pages/{domain}/sections/` in most Spernakit apps.
2. **Read the page component** (and any tab / section it composes that is material to describing what the screen does).
3. **Extract signals**:
    - Top-level section headings, `Card` titles, or H2/H3 text → Core Region names
    - Mutation hook names (`useXxxMutation`, `useMutation({ mutationFn: … })`) → Key Controls
    - Dialog component names opened from the page → Key Controls
    - Query hook names and what they fetch → Purpose
    - Route-guard / role checks visible in the component → role-related notes
4. **Match feature drivers**: list all directories under `{app}/.aidd/features/` and, for each screen, identify feature slugs whose name semantically matches the screen's functionality. Read the candidate `feature.json`'s `title` and `description` fields to confirm. Preferred match sources, in order:
    - Exact name match (`dashboard-page` ↔ Dashboard screen)
    - Title field match (read `feature.json` titles across `.aidd/features/`)
    - Dependency graph: if a clearly-matching feature depends on infrastructure features, include those too when they contribute functionality visible on the screen
5. **Flag uncovered screens**: screens with no plausible feature-driver match. These become candidates for Phase 5's feature-backfill proposal.

Produce a per-screen summary: `{ route, screen, inferred_purpose, inferred_core_regions, inferred_key_controls, matched_drivers, unmatched: bool }`.

### Phase 5: Reconcile and report drift

Produce a single drift report to the user with these sections. Use counts and full lists; do not truncate.

1. **New routes**: in code, missing from Route Map. For each: proposed Screen name, Min Role, path, and **inferred Primary Purpose** (one short sentence from Phase 4).
2. **Removed routes**: in Route Map, missing from code. List each with its current row, then **keep the row** and annotate its Screen cell `(not found in code YYYY-MM-DD)`. A route temporarily disabled in nav is not necessarily gone, and silently deleting a hand-written row destroys work the code cannot regenerate — annotating is reversible, deleting is not.
3. **Min-role mismatches**: three kinds:
    - Map says X, nav says Y
    - Map says X, route-guard says Y
    - Nav says X, route-guard says Y (record even if the map matches one of them)
4. **Screen Details orphans**: `### <Screen>` sections whose path does not match any Route Map row. List for user review.
5. **Screen Details TODO stubs**: existing narrative sections whose Purpose / Core Regions / Key Controls are effectively TODO placeholders. List them; Phase 6 will replace with inferred content.
6. **Traceability drift**:
    - Route Map screens with no Traceability row → propose a row with **inferred drivers** from Phase 4
    - Traceability rows with TODO drivers where Phase 4 found matches → propose replacement
    - Traceability rows whose listed feature slugs do not exist under `.aidd/features/` → flag as stale. If Phase 4 found a valid replacement, propose it; otherwise annotate `TODO (stale)` and don't delete
    - Duplicate Screen names → flag for dedup (keep first occurrence)
7. **Primary Navigation prose**: diff the current comma-joined label list against nav order; report if out of sync.
8. **Uncovered screens - missing feature blueprints** (the reconstruction-completeness check). For every screen where Phase 4 found **no matching feature.json**, list:
    - Route + Screen name
    - Inferred feature title and description (from the page code)
    - Proposed slug (dash-case, matches existing naming conventions in `.aidd/features/`)
    - Proposed dependencies (upstream features whose ids surface in the page's imports or that are obviously prerequisites, e.g. `appshell-layout`, `frontend-api-client`)

Emit the report, then **apply every change in it** and continue to Phase 6. Lead with a summary line:
`N new routes, M removed, K role mismatches, J traceability fixes, U uncovered screens — applied.`

Apply every documented default directly. Where a change is genuinely ambiguous, record it in the
report so the diff can be reviewed afterward.

### Phase 6: Apply updates to screen-map.md

Write the updated `screen-map.md`:

- **Primary Navigation paragraph**: regenerate as a comma-joined list of nav labels in nav-config declaration order (section groups collapsed).
- **Route Map table**:
    - Preserve every existing row's Screen verbatim; annotate removed routes rather than deleting them
    - For existing rows with `TODO`-ish Primary Purpose, replace with the Phase 4 inferred one-sentence purpose
    - Preserve hand-written Primary Purpose text verbatim
    - On a Min Role mismatch, write the **stricter** of the two values and list the mismatch in the report. Never ask which source wins — the stricter value fails closed, and the report names every row that was resolved this way
    - Append new-route rows in the order they appear in `routes.tsx`, with the Phase 4 inferred Primary Purpose
- **Screen Details sections**:
    - Preserve hand-written narrative sections byte-for-byte
    - For new routes: write a full stub from the Phase 4 signals in the format:

        ```
        ### <Screen Name> (`/path`)

        #### Purpose

        <inferred paragraph: 1-3 sentences from query hooks, mutation scope, route guard>

        #### Core Regions

        - **<Region Name>**: <one-line description from the component/section>
        - ...

        #### Key Controls

        - <Mutation / dialog / filter action>: <how it is triggered>
        - ...
        ```

    - For existing TODO-stub sections (identified in Phase 5 step 5): replace with the inferred content in the same format
    - Only fall back to `TODO: describe.` if the page component is a genuine placeholder (no JSX, just a stub); this should be rare

- **Screen-to-Feature Traceability table**:
    - Use Phase 4's matched drivers for new screens and TODO-driver rows
    - Dedupe (keep first occurrence, drop later duplicates)
    - For stale refs with a valid replacement, swap in the replacement; for stale refs with no replacement, annotate `TODO (stale)` and leave the existing slug; do not delete
    - When no matching feature exists: list the **new slug** that Phase 7 creates for it.

Make surgical edits for single-table updates, row additions, and individual section replacements.
Create or rewrite the complete file only when it does not exist or when more than about 15 separate
edits would be less reliable. Do not reformat untouched portions.

Newly inferred narrative prose (Purpose paragraphs, region and control descriptions) follows the humanize-docs style contract (`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo); read it before drafting. Minimum bar if it is unavailable: plain natural language, no em-dashes, no AI filler (delve, leverage, robust, seamless). This applies only to text this skill writes; hand-written sections stay byte-for-byte untouched.

### Phase 7: Backfill missing feature.json blueprints

For every uncovered screen reported in Phase 5, create
`{app}/.aidd/features/{slug}/feature.json` using this schema (matches Spernakit template conventions).
A screen without a blueprint leaves the reconstruction incomplete, and a backfill with
`status: completed` describes code that already exists rather than queuing new work:

```json
{
	"affectedFiles": ["<known file paths this screen comprises; may be empty initially>"],
	"category": "<UI | Backend | Data | Infrastructure | Auth>",
	"createdAt": "<ISO-8601 timestamp of this run>",
	"dependencies": ["<id of each prerequisite feature>"],
	"description": "<one-sentence description inferred from the page>",
	"id": "<clean-descriptive-slug>",
	"priority": 3,
	"spec": "<multi-step numbered verification spec based on what the page actually does>",
	"spernakit_version": "<ONLY when target app IS spernakit; omit for derived apps>",
	"status": "completed",
	"title": "<Title Case Screen-ish Name>"
}
```

Rules for generating a valid feature.json:

- **`id`**: use a clean descriptive slug (e.g. `bug-inbox`, `run-console-page`): no app prefix, no timestamp, no `feature-` prefix. This matches the house base-feature naming convention in `consolidate-features.md`. The directory name must match the `id`. Read all existing `id` fields in the app's `.aidd/features/**/feature.json` to avoid collisions.
- **`affectedFiles`**: JSON array of known file paths the screen comprises (page component, tabs/sections, dialogs, API modules). May be empty initially, but populate it from the Phase 4 reads when the paths are known. This field is part of the canonical schema (see `feature-review-all.md`).
- **`dependencies`**: must be a JSON array (even if empty). Every slug in it must match the `id` field of another existing `feature.json` in the same app. Grep `"id":` across `{app}/.aidd/features/**/feature.json` to confirm; directory names are NOT valid dependency slugs; the `id` field value is what matters. Common upstream dependencies for UI screens: the appshell feature's id, the api-client feature's id, and the auth/router feature's id.
- **`spernakit_version`**: include this only when the target app is Spernakit itself. Omit it for
  derived apps because `template-upgrade` deletes derived-app features that carry the field. For
  Spernakit, use the exact version from `<spernakit-root>/package.json`; do not patch-bump an older
  value from a neighboring feature.
- **`spec`**: derive from the page code. Enumerate observable behaviors: "Verify `<Page>.tsx` exists", "Verify `<mutation>` mutation wires through `<API module>`", "Verify `<dialog component>` renders from `<trigger button>`", etc. Aim for 5-12 numbered steps. This is a reconstruction spec; it should be enough for an agent to rebuild the screen if it were deleted.
- **`status`**: use `completed` since the screen already exists in code. (The blueprint is being back-written to match reality, not forward-planning new work.)
- **`category`**: choose from the vocabulary used by existing features in the same app (grep `"category":` to sample).

Create each `feature.json`, then run the feature validator:

```bash
cd <aidd-root> && bun run start -- --project-dir {appname} --check-features
```

Use the current runtime at `<aidd-root>`.

Report the output. If any blueprint comes back invalid, **fix it before declaring the skill complete**; common failures are:

- Missing `"dependencies": []` field entirely
- Dependency slugs that match a directory name but not the referenced feature's `id` field; re-grep the target's `"id":` line to get the real slug
- Invalid `status` or `category` enum values
- Trailing commas / JSON syntax errors

### Phase 8: Verify

After all writes complete:

1. Re-read `screen-map.md` and confirm:
    - Every path from Phase 2 has exactly one Route Map row
    - Every Route Map screen has exactly one Screen-to-Feature Traceability row
    - Hand-written `### <Screen>` narrative sections from Phase 3 are byte-identical to before
    - No remaining `TODO: describe screen purpose` or `TODO: describe.` placeholders unless explicitly justified in the report (placeholder pages only)
2. If any `.aidd/features/*/feature.json` was created or modified, confirm the Phase 7 validator output was clean. If it was skipped (no feature files touched), skip this step.
3. Report what changed as counts:
    - `N route rows added, M removed, K role cells updated`
    - `P Screen Details sections replaced from TODO to inferred narrative`
    - `Q traceability rows populated from inference, R flagged stale`
    - `S new feature.json blueprints created`
4. Remind the user:
    - Inferred content is best-effort; the user should skim the new narrative blocks and correct any misreads
    - Min Role values are advisory; verify at runtime by loading each new route as a user at that role, or run `bun scripts/crawltest.ts --page <route>` if the app has crawltest
5. If the app has `bun run smoke:qc`, note that it is not required; this skill only edits `.aidd/screen-map.md` and possibly `.aidd/features/*/feature.json`, neither of which affects the code pipeline.

## Notes

- **Inference-first, not TODO-first.** Infer from code wherever possible. Emit TODO only when the
  code is genuinely silent, such as a placeholder page or a missing feature blueprint.
- **Preserve hand-written content.** A section with substantive prose (multi-sentence Purpose, enumerated Core Regions with bolded names and descriptions) is hand-curated and must not be rewritten. A section that is just `TODO` in every subsection is a stub and is eligible for inference replacement.
- **Reconstruction completeness.** The goal of `.aidd/features/` is to let an agent rebuild the app from blueprints. A route in `routes.tsx` with no matching feature.json is a gap in that blueprint. This skill closes the gap by proposing backfills, validated against the aidd feature checker.
- **Delegate large inference passes by capability.** When the backend supports independent workers,
  give each worker a self-contained prompt listing its screens, page-component conventions,
  `.aidd/features/` location, and required `PURPOSE / DETAILS / DRIVERS` output. Process the same
  groups sequentially when delegation is unavailable.
- **No helper script.** Do not create a TypeScript helper under `scripts/` for this; it violates Spernakit's "no utilities without an immediate consumer" rule. The reconciliation runs inside this skill each invocation.
- **Spernakit-lite variants.** If a Spernakit app does not have `navConfig.tsx` (the lite variants
  omit it), fall back to route-guard minimum roles and readable component names. Note the missing
  navigation configuration in the report.
