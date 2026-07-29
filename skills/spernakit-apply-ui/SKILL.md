---
name: spernakit-apply-ui
description: 'Apply an externally provided UI to a Spernakit app as a whole-app visual replacement while preserving routes, stores, APIs, and features. Use when implementing screenshots, HTML/JSX, a template repository, or a written redesign; record net-new behavior as aidd backlog stubs.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: ui-parity
---

# Spernakit Apply UI

Adapt a supplied UI source to a Spernakit frontend while preserving all existing functionality.
Render true net-new UI elements and track them as `.aidd/features/` backlog stubs.

## Operating Principle

This skill **only changes how the app looks**. It never changes what the app does, what data it shows, what endpoints it calls, what role can do what, or what pages exist. Every existing route stays reachable. Every existing feature stays wired. Every existing store, query, mutation, and guard keeps working. The output is a re-skinned, fully-functional copy of the target app, not a partial replacement, not a "shell-only" adoption, not a per-page rewrite that drops features.

**Source coverage is never a reason to drop a target screen.** If the source defines N of M target
screens in detail, all M target screens still receive the new look. Use detailed source screens to
direct per-page layouts. Re-skin the remaining target screens in place with the source design
tokens, primitives, layout shell, and component mappings. Do not limit the work to the shell or
leave uncovered pages unchanged.

## Usage

```
spernakit-apply-ui
spernakit-apply-ui <path-to-source-ui>
```

`<path-to-source-ui>` may be a directory of screenshots, an HTML/JSX file, a template repo root, or
a prose spec file. If omitted, infer a unique source path or attachment from the request; otherwise
return a usage error listing discovered candidates.

**Target application is the current working directory.** The source is the argument. Report both
resolved paths before Phase 1 starts, then continue directly.

## Hard Invariants

Non-negotiable. If the source UI requires breaking any of these, return a blocker that identifies
the invariant and evidence.

- Every route in `frontend/src/routes.tsx` stays reachable with its existing path and role guard
- Every Zustand store in `frontend/src/stores/` keeps its state shape and persistence behavior (do not silently change localStorage vs sessionStorage)
- Every API module in `frontend/src/api/` keeps its exported function signatures
- `frontend/src/api/types.ts` stays in sync with the OpenAPI spec served at `/api/v1/docs/json`; `bun run check:api-types` must stay green
- No `any` types; ES modules only; tabs, single quotes, 100-char lines (see `docs/template/DEVELOPMENT.md`)
- `bun run smoke:qc` must pass after the apply
- No feature flags, no transitional/compatibility shims, no dead code
- Database and backend logic are off-limits unless a mapped feature explicitly demands a new
  endpoint; create a separate `.aidd/features/` backlog stub and continue independent UI work
- **Drop source Supabase coupling.** Frontend code from source must not retain
  `@supabase/supabase-js` imports, source `AuthContext`, hardcoded Supabase URLs, or direct-DB
  queries. Replace with existing Spernakit `api/*` modules and `authStore`. If behavior depends on
  source-only Supabase features, create a backlog stub and continue independent UI work.
- **Drop source Context providers.** Discard source-provided Context providers (auth, theme, data, workspace) in favor of existing Zustand stores + TanStack Query. Rewire components consuming source Contexts to the equivalent store or hook during page rebuild.
- **Drop source role enums.** Source role strings/enums (e.g. `SYSOP`, `MANAGER`) are discarded; all RBAC checks use existing `useAuthorization` + the target app's role taxonomy. A source-only role with no target equivalent becomes a net-new feature stub, not a new role.

## Input Types

Recognize the source UI kind before starting:

- **Screenshots / images (PNG/JPG/Figma exports)**: read with multimodal vision. Produce a per-image catalog: layout grid, components, palette, typography, spacing, interactive affordances.
- **HTML / JSX snippets**: parse the markup directly. Identify reusable components, layout (grid/flex), Tailwind utility classes, state hooks if any.
- **Full React / template repo**: treat as a **read-only reference**. Cannibalise JSX, class strings, and CSS variables into the current app. Never add a cross-workspace import; never run the source repo's build in the target app.
- **Written spec / brand book / designer notes**: extract tokens (colors, radii, fonts, spacing, shadows), voice, component hierarchy, and interaction rules.

If multiple input types are provided together (e.g., screenshots + prose spec), merge them into one structured catalog in Phase 2.

**Source-tree shape.** If the given path contains a `project/` subdir, treat that as the source root; sibling dirs (`supabase/`, `scripts/`, `logs/`, `node_modules/`) are out-of-scope reference material and MUST NOT be imported. In particular, sibling `supabase/` directories (migrations, RLS policies, edge functions) are never copied into the target; the target backend is Elysia + Drizzle.

**Code + screenshots coexisting.** If a source repo contains both a working `src/` AND a `screenshots/` dir, code is authoritative for structure (component hierarchy, routing, state shape); screenshots are authoritative for visual polish/tokens (color, spacing, typography) where they disagree. Catalogue both and flag disagreements for user resolution.

## Workflow

### Phase 0 - Scope sizing

Before any inventory work, estimate source page count and target page count. If the source has **>20
pages** or the eventual Phase 3 mapping table is likely to have **>30 rows**, use this checkpointed
phased apply plan automatically:

1. Design system (tokens, themes, fonts, shadcn installs)
2. Layout shell (AppShell, Sidebar, Header, MobileNav, CommandPalette)
3. Page group 1 … N (grouped by domain, ~10 pages each)

Each phase ends with `bun run smoke:qc` green before the next begins. Do not attempt a single-PR apply for large sources.

### Phase 1 - Inventory the current app (read-only)

Use parallel read-only exploration when the active provider supports it and the app is non-trivial.
Catalog:

- Routes + lazy-load wiring in `frontend/src/routes.tsx` and `frontend/src/routes/lazyPages.ts` (React.lazy named-export adapter pattern must stay intact)
- Pages in `frontend/src/pages/**` with each page's stack trace: page → API module → Zustand store → TanStack Query hook → shadcn components used
- Layout shell in `frontend/src/components/layout/` (AppShell, Sidebar, Header, MobileNav, CommandPalette, CommandPaletteLauncher, HeaderBarActions)
- Stores in `frontend/src/stores/` (authStore, themeStore, sidebarStore, workspaceStore, layoutStore, wsStore)
- API modules in `frontend/src/api/` + `api/client.ts` singleton
- Theme tokens in `frontend/src/tailwind.css` (OKLch variables: `--primary`, `--background`, `--card`, `--border`, etc.) and `frontend/src/lib/themes.ts` (AppTheme type + APP_THEMES array)
- shadcn components installed under `frontend/src/components/ui/`
- Auth/role gates (`ProtectedRoute`, `useAuthorization`)
- `.aidd/features/`: existing feature inventory so new stubs don't collide with existing IDs

Produce a compact inventory document before proceeding to Phase 2.

### Phase 2 - Parse the source UI

For each input type, produce a structured catalog covering:

- **Screens / pages**: one entry per distinct layout the source defines
- **Layout shell**: top-level chrome (nav, sidebar, header, footer, command palette)
- **Components**: reusable atoms and molecules (buttons, inputs, cards, tables, dialogs, empty states)
- **Design tokens**: colors (convert to OKLch), typography (font families + weights + sizes), radii, shadows, spacing scale, dark-mode tokens if applicable
- **Net-new elements**: anything in the source with no obvious counterpart in the current app
- **Primitive-to-shadcn mapping**: if the source uses raw Tailwind primitives (no Radix, no shadcn), produce a mapping table (source component name → target shadcn component), e.g. source `Card` → shadcn `Card`, source `Pill` → `Badge`, source `Modal` → `Dialog`, source inline `<input>` → shadcn `Input` + `Label`. Raw primitives with no shadcn counterpart get installed via `bunx shadcn@latest add`; duplicates of existing shadcn components reuse the existing one.

Flag ambiguities explicitly; never invent. Preserve the target's current data wiring. Treat a source
element without an evidenced target data source as net-new UI and create the Phase 5.6 backlog stub.

### Phase 3 - Map old → new

Produce a mapping table showing every existing page/feature placed into a new-UI slot:

| Existing Page | Existing Functionality (API / Store / Query) | New-UI Target Slot | Net-New? | Notes |
| ------------- | -------------------------------------------- | ------------------ | -------- | ----- |

- Present the mapping before code is written, then apply it directly
- **If the source has no slot for an existing target page**, that page is **re-skinned in place**:
  keep its existing composition, swap in source design tokens, primitives, shell chrome, and
  shadcn-mapped components. Mark the row `New-UI Target Slot = (re-skin in place)`. Never leave it
  un-rebuilt or replace it with a placeholder.
- If source UI has slots with no existing feature, those rows get `Net-New? = Y` and feed Phase 5.6
- **Source routing is discarded.** Source hash routers, state-machine `currentPage` switches, and prop-drilled `onNav` callbacks are never carried over. Keep only the JSX bodies; navigation is rewired to `useNavigate` against the existing `routes.tsx`. Any source route with no target route becomes a net-new stub.

### Phase 4 - Plan design-system changes

List as a single diff-preview table, then apply directly:

- Token edits in `frontend/src/tailwind.css` (OKLch values for light + dark)
- Theme entries in `frontend/src/lib/themes.ts` (new `AppTheme` values or updated preview swatches)
- Font changes: **prefer `@import` in `frontend/src/tailwind.css`**. Only touch `index.html` for fonts that need `rel=preconnect` for measurable LCP wins on the landing route.
- shadcn components to install via `bunx shadcn@latest add <component>`
- Radii, shadow, and spacing scale changes

**Tailwind v3 → v4 migration.** If the source is Tailwind v3 (has a `tailwind.config.js` with `theme.extend`) and the target is Tailwind v4 CSS-first, the source config is **reference-only**. Migrate `theme.extend.colors` into `@theme` / `:root` CSS variables in `frontend/src/tailwind.css` as OKLch. Do NOT copy `tailwind.config.js` into the target. Call out the v3→v4 shift explicitly in the design-system delta so the user knows hex values were converted.

Apply the complete design-system delta in Phase 5 after presenting the table.

### Phase 5 - Apply in dependency order

Apply in this exact order. Re-run `bun run typecheck` and `bun run lint` after each group; do not proceed on failures.

1. **Install new shadcn components**: `bunx shadcn@latest add <component>` per mapped item
2. **Update `frontend/src/tailwind.css`**: new OKLch tokens for `:root` and `.dark` (plus theme-specific selectors like `.theme-forest` if added)
3. **Update `frontend/src/lib/themes.ts`**: add/edit `APP_THEMES` entries; import any new fonts in `tailwind.css`
4. **Rebuild the layout shell** in `frontend/src/components/layout/`: AppShell, Sidebar, Header, MobileNav, CommandPalette. Preserve every store binding (`sidebarStore`, `layoutStore`, `themeStore`, `authStore`, `workspaceStore`, `wsStore`). Preserve keyboard shortcuts (Cmd+K) and responsive breakpoints.
5. **Rebuild pages one by one**: every target page ships re-skinned. Two cases:
    - **Source has a detailed layout for this page**: page = (new JSX per the source layout) + (original hooks, stores, API calls, auth guards, TanStack Query keys).
    - **Source has no layout for this page** (re-skin in place): keep the existing page composition, swap in the source's design tokens, primitives, shell chrome, and shadcn mappings. The page must look like it belongs to the new design system even though the source never drew it.

    Either way: keep the lazy-load adapter shape so `routes/lazyPages.ts` still resolves named exports. Keep existing `PageHeader` / `EmptyState` / `ErrorBoundary` usage unless the source UI explicitly replaces them, in which case update the shared component, don't fork per page. **Never leave a target page un-rebuilt and never replace one with a placeholder.**

    **Loading / empty / error states are mandatory.** Source JSX typically consumes mock data synchronously and has no async states. When wiring real TanStack Query hooks in, every rebuilt page must wrap data consumption: `{isLoading ? <Skeleton/> : isError ? <ErrorState/> : data.length === 0 ? <EmptyState/> : <...>}` using existing Spernakit conventions. This is NOT net-new UI; it's a non-negotiable integration step. Pages that render `undefined.map(...)` fail smoke:qc and crawltest.

6. **Net-new elements**: load the staged `ui-parity` contract from
   `.aidd/skills/ui-parity/SKILL.md` (or `skills/ui-parity/SKILL.md` when running inside aidd),
   render the JSX, and leave handlers as typed no-op stubs commented `// TODO(feature-id)`. For
   each stub, create `.aidd/features/<slug>/feature.json` using its format:

```json
{
	"category": "Frontend",
	"createdAt": "{ISO_TIMESTAMP}",
	"dependencies": ["{existing_feature_ids_if_applicable}"],
	"description": "{what the new UI element shows; what functionality is needed to wire it up}",
	"id": "{descriptive-slug}",
	"passes": false,
	"priority": 1,
	"spec": "1. Verify ...\n2. Verify ...",
	"status": "backlog",
	"title": "{concise title}",
	"updatedAt": "{ISO_TIMESTAMP}"
}
```

Use `ui-parity`'s priority mapping (critical/high=1, medium=2, low=3) and spec-writing rules (numbered "Verify" statements, specific element names, happy path + edge cases).

If `.aidd/roadmap.json` exists, assign each new stub to the current milestone: the existing milestone with the highest numeric `priority`. Never create a new milestone for UI-apply stubs.

### Phase 6 - Verify end-to-end

- `bun run smoke:qc`: must pass. Fix failures file-by-file; no bulk sed/awk, no rule relaxation, no `--no-verify`.
- `bun scripts/crawltest.ts`: every route renders without console errors
- `bun scripts/crawltest.ts --screenshot-pages`: spot-check visuals match the source UI
- For each route behind a role guard touched in Phase 5.4-5.5: `bun scripts/crawltest.ts --page <route>` under the required role
- Confirm `bun run check:api-types` remains green. A mapped backend requirement becomes a backlog
  stub under the Hard Invariants. The check fetches `/api/v1/docs/json`, so start the backend with
  the app's documented command or use supported offline cache mode.

### Phase 7 - Reconcile `.aidd/features/`

For every existing feature whose UI was rebuilt:

- Bump `updatedAt` to today (ISO format)
- Bump `spernakit_version` to the CURRENT spernakit version (read from `spernakit/package.json` if in a derived app, or from the app's own `package.json` `version` if applying to spernakit itself). Do NOT patch-bump the old value; set it to the current version.
- Update `spec` points whose described elements, names, or interactions changed
- Leave `id`, `createdAt`, `dependencies`, `status`, `passes`, `priority` unchanged

Commit new Phase 5.6 stubs alongside. If roadmap assignments changed, run `bun run aidd-tools -- roadmap:apply --project-dir <target-app>` from `<aidd-root>`. Then run `bun run check:feature-integration` to confirm every page/route still has a feature entry and every feature still has a wired consumer.

## Decision Rules

| Source UI says…                                         | Do                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Better layout / spacing / visual hierarchy / polish     | **Adopt**: update the target                                                |
| Fewer columns on a dense data table                     | **Preserve current** data density; hide via overflow/responsive instead     |
| Lower contrast, smaller hit targets, remove focus rings | **Preserve current** accessibility behavior and reject the change           |
| Hides an action RBAC permits                            | **Preserve current** visibility for the role                                |
| Implies new data / new endpoint / backend change        | **Flag**: create a `.aidd/feature-*` stub, do not silently add backend code |
| Conflicts with an existing store shape                  | **Preserve** the store; adapt the JSX to consume the existing shape         |

Run a focused accessibility and responsive-layout review over every rebuilt layout and page component as a post-apply gate. Fix critical and serious issues before reporting done.

## Output / Summary Report

At the end, produce a structured markdown report:

```markdown
## Apply UI Complete: <source> → <target-app>

### Files Touched (N)

| Area | File | Change |
| ---- | ---- | ------ |

### Pages Rebuilt (N)

| Page | Existing Functionality Preserved | Net-New Slots |
| ---- | -------------------------------- | ------------- |

### Design System Changes

- Tokens updated: <list of CSS variables>
- Themes added/edited: <list>
- Fonts added: <list>
- shadcn components installed: <list>

### Net-New Feature Stubs Generated (N)

| Slug | Title | Priority |
| ---- | ----- | -------- |

### Feature Specs Reconciled (N)

| Feature | Spec Changes |
| ------- | ------------ |

### Verification

- smoke:qc: <status>
- crawltest full: <status>
- crawltest screenshots: <path>
- accessibility critical/serious: <counts>
```

## Related Skills

- **`ui-parity`**: staged contract and source of the `feature.json` template, priority mapping,
  and spec-writing rules. Phases 5.6 and 7 reuse those conventions verbatim.
- **`spernakit-diff-sync`**: similar adopt/preserve framing for code-level drift.
- **`spernakit-tester`**: deeper end-to-end testing beyond crawltest, if the apply covers a lot of pages.

## Notes

- Spernakit canonical rules: `spernakit/docs/template/STACK.md` and `spernakit/docs/template/DEVELOPMENT.md`
- Architectural constraint: every feature wired end-to-end, every backend route registered in `backend/src/create-api-app.ts`, every frontend page in `frontend/src/routes.tsx`, every route with a navigation path
- Module exports: named exports only. React.lazy adapters: `.then((m) => ({ default: m.ComponentName }))`
- Database files only under `data/` at app root, never `backend/data/`
- Never skip quality checks or relax linting rules; report a hard blocker if compliance cannot be maintained
- Require the target app's current `.aidd/features/` layout. If it is absent, stop and direct the
  user to the aidd onboarding or spernakit-template-upgrade workflow instead of creating a parallel metadata
  tree.
