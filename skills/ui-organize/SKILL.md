---
name: ui-organize
description: "Reorganize a Spernakit-derived application's primary navigation by workflow and frequency while standardizing groups, labels, and icons. Use to clean up, reorder, or simplify navigation and sidebars."
metadata:
    aidd-category: spernakit-fleet
---

# UI Organization

Review the primary navigation of one or more Spernakit-derived applications whose nav menus have
grown cluttered. Reorganize them by workflow and frequency, standardize presentation, report the
decision, and apply the evidence-backed edits directly.

## Usage

```
ui-organize [appname...]
```

- Zero args → infer the target from a cwd under `<applications-root>/<app-name>`. If cwd is the
  applications root, process every eligible Spernakit app in `<applications-root>/AGENTS.md`.
- One or more app names → iterate in order. Each app gets its own report, apply, and verification cycle.
- Special token `all-spernakit` → iterate over every `[spernakit]`-stack app listed in `<applications-root>/AGENTS.md`. Still one report per app.

## Context

### What "cluttered" actually means here

The Spernakit Sidebar renders a **single flat list** of `NavItem`s from `frontend/src/components/layout/navConfig.tsx`. The `NavSeparator` type exists in the `NavEntry` union, but the template `Sidebar.tsx` filters it out via `navItems`. Separators are wired in the type system but are not rendered by the default shell. Apps that want grouped navigation must either:

- reorder the flat list so related items sit next to each other, or
- extend `Sidebar.tsx` / `MobileNav.tsx` to render `NavSeparator` entries as visible section headings.

"Cluttered" is typically one or more of:

- 9+ flat items with no grouping, forcing the eye to scan the whole list
- High-frequency items buried below rare admin pages
- Related items (e.g. `Servers`, `Services`, `Ports`, `Credentials`) separated by unrelated items
- Settings / Admin items mid-list instead of at the bottom
- Icon inconsistency (different icon sets, different visual weight, ambiguous metaphors)
- Label inconsistency ("Custom Dashboards" next to plain "Analytics"; singular/plural mix)
- Primary-purpose screens sitting at equal rank with meta-screens (Notifications, Workspaces) when the app is "about" something specific

### Source-of-truth files per app

- `frontend/src/components/layout/navConfig.tsx`: the `navEntries` array (may already have separators)
- `frontend/src/components/layout/Sidebar.tsx`: desktop shell rendering
- `frontend/src/components/layout/MobileNav.tsx`: mobile shell rendering
- `frontend/src/components/layout/TopBar.tsx` / `Header.tsx` / `HeaderBarActions.tsx`: header-bar actions (for overlap analysis)
- `frontend/src/routes.tsx`: ground truth for which routes exist and their guards
- `.aidd/screen-map.md` (if present): Primary Navigation prose, Route Map, and per-screen purpose
- App row in `<applications-root>/AGENTS.md`: one-line app description (the authoritative statement of purpose for this review)
- `.aidd/project.md` / `README.md` at app root: richer purpose context when present

### Architectural guardrails (read before touching code)

- `<applications-root>/spernakit/docs/template/STACK.md` and `DEVELOPMENT.md` are canonical.
- The template owns the `NavItem`/`NavEntry` shape. Do not change the type signature, only the array contents.
- The template `Sidebar.tsx` is **template-managed**. If you need to render separators you have two choices: (a) keep rendering changes in the app's own Sidebar/MobileNav (app drift from template), or (b) propose the rendering change upstream into the Spernakit template. Default to an app-local change and call it out in the report.
- No unused imports. No dead icon imports after reordering.
- Do not relax lint rules.

## Instructions

### Phase 1: Resolve targets and load context

1. Parse `$ARGUMENTS`. Build the target list (one or more app names, or `all-spernakit` → expand, or infer from cwd).
2. For each target, verify:
    - `<applications-root>/{app}/frontend/src/components/layout/navConfig.tsx` exists
    - `<applications-root>/{app}/frontend/src/components/layout/Sidebar.tsx` exists
    - `<applications-root>/{app}/frontend/src/routes.tsx` exists
      If any is missing, skip the app and note why in the final report (Spernakit Lite variants may lack navConfig).
3. Load the app's one-line description from `<applications-root>/AGENTS.md` (the app table). This is the primary statement of purpose. Also read `.aidd/screen-map.md`'s "Primary Navigation" paragraph and top-level Purpose text if present.
4. Note whether the app's `Sidebar.tsx` / `MobileNav.tsx` differ from the template's (drift check). Diff the current `Sidebar.tsx` against `<applications-root>/spernakit/frontend/src/components/layout/Sidebar.tsx`. Identical means template-managed; divergent means the app has local rendering changes you can safely extend.

Process apps sequentially so reports, edits, and visual verification cannot interleave.

### Phase 2: Inventory the current nav

For each app, read `navConfig.tsx` and produce an inventory:

1. Ordered list of every entry with: position, `label`, `to`, `icon` component name, `minRole` (default `VIEWER`), `featureFlag` (if any), and whether it's a `NavItem` or `NavSeparator`.
2. Counts: total entries, items-only, separators, feature-gated, role-gated.
3. For each item, resolve the corresponding route in `routes.tsx` and, if the app has a screen_map, the Primary Purpose text. This gives each item a one-line "what it does" anchor.
4. Cross-check the header bar (`TopBar.tsx` / `Header.tsx` / `HeaderBarActions.tsx`) for any items that appear both in the sidebar and as header buttons. An overlap like "Notifications" (bell in header + 'Notifications' in sidebar) is usually not a clutter issue. But if the sidebar version duplicates a header action with no additional surface (e.g. a link that opens the same popover the bell already opens), flag for removal consideration.
5. Check whether `MobileNav.tsx` reuses `navItems` directly or has its own subset. Note the divergence so Phase 5 edits stay in sync.

### Phase 3: Evaluate against heuristics and propose a layout

Score the current nav against these heuristics (weight each observation, don't just count):

**Logical grouping**

- Cluster items by the user's mental model of the app, using the app's AGENTS.md one-liner as the anchor. Example: an infrastructure dashboard described as a "Homelab Survival Kit" should make Servers, Services, Ports, Credentials, Licenses, Backups, Targets, and Coverage Gaps the **primary** cluster, with Home/Dashboard at the top and Notifications/Dashboards/Analytics/Settings as secondary.
- A cluster usually has 3-7 items. Clusters of 1-2 either merge with an adjacent cluster or dissolve into the default flow.
- Admin and Settings always go last, regardless of alphabet.

**Frequency / workflow ordering**

- Daily-use items sit above weekly-use items which sit above monthly-use items. If the screen_map has usage-frequency notes, use them; otherwise infer from the screen's Purpose (dashboards and inboxes are daily; settings and workspaces are monthly).
- Within a cluster, prefer workflow order (e.g. **Servers → Services → Ports** because a user drills in that direction) over alphabetical.

**Surface-area reduction**

- If a sidebar entry is a pure duplicate of a header-bar action, propose removing the sidebar entry.
- If two entries navigate to the same feature at different depths (e.g. `/notifications` and `/notifications/settings`), keep the top-level only; the detail page is reached via in-page navigation.
- If a cluster has 8+ items, propose splitting it into two clusters with a separator between them, OR moving the least-used item(s) into Settings as sub-pages. Use the second option only if the target page already supports sub-navigation; do not invent settings sub-navigation in this skill.

**Aesthetic consistency**

- Icons: verify all come from `lucide-react` (the Spernakit default). If the file mixes Lucide with another set, flag it.
- Icon metaphor: each icon should map clearly to the label. Common mismatches: generic `Settings` gear used for a non-settings page; `LayoutGrid` used interchangeably with `LayoutDashboard` for similar concepts.
- Icon visual weight: all `className="size-5"` for parity with the template. Flag any divergent sizes.
- Labels: decide singular vs plural once per app and apply uniformly (typically plural for list-of-entities pages). Avoid mixing "Custom Dashboards" with "Analytics"; use adjectives for both or neither. Prefer noun labels and avoid verbs ("Manage Users" to "Users").
- Separators: separator labels use Title Case, short (1-2 words), no punctuation. Examples: "Infrastructure", "Reports", "Admin".

**Separator rendering capability**

- If the app's `Sidebar.tsx` / `MobileNav.tsx` does **not** render `NavSeparator` entries, adding separators to `navEntries` has no visible effect. Two options:
    1. **Option A: Pure reorder.** Add no separators; let clusters rely on adjacency alone. This is the safer default.
    2. **Option B: Add separator rendering** to the app's Sidebar + MobileNav. This requires three edits (navConfig + Sidebar + MobileNav) and is outside the template. Propose it only when the app already has other local shell drift or when reordering alone does not adequately declutter.
- Choose Option A unless reordering alone is inadequate and the app already has local shell drift;
  only then choose Option B. State the evidence in the report.

Produce a proposed layout in the same `NavEntry[]` shape the file uses, with a brief rationale per change (move / rename / remove / group). Example format:

```
Proposed layout for sample infrastructure app (18 entries → 15):

  # Overview
  - Home                              (unchanged, position 1)

  # Infrastructure             ← new separator
  - Servers                           (unchanged)
  - Services                          (unchanged)
  - Ports                             (unchanged)
  - Targets                           (moved up from position 10 for the core workflow)
  - Coverage Gaps                     (unchanged)

  # Credentials & Access       ← new separator
  - Credentials                       (grouped with Licenses)
  - Licenses                          (moved adjacent to Credentials)

  # Operations                 ← new separator
  - Backups                           (unchanged)
  - Notifications                     (moved down for lower daily use)

  # Reports                    ← new separator
  - Custom Dashboards                 (renamed → "Dashboards" for consistency with Analytics)
  - Analytics                         (unchanged)

  # Admin                      ← new separator
  - Onboarding                        (unchanged, ADMIN-only)
  - Settings                          (unchanged, ADMIN-only)

  Removed:
  - (none)

  Relabeled:
  - "Custom Dashboards" → "Dashboards" (rationale: parity with "Analytics"; "Custom" is implied by the feature)
```

### Phase 4: Report the decision

Present, per app, in this order:

1. **App purpose:** verbatim line from `<applications-root>/AGENTS.md`.
2. **Current inventory:** N items, existing clusters (if any), and notable issues (3 to 6 bullets maximum).
3. **Proposed layout:** the block from Phase 3 with clusters and rationale.
4. **Edits required:** file list. Always include `navConfig.tsx`. Include `Sidebar.tsx` and
   `MobileNav.tsx` only when the evidence selects Option B.
5. **Risk and rollback:** this edits render order only, with optional rendering changes if
   separators are added. Call out every user-visible label rename and every demotion.

Continue directly to Phase 5 after presenting the report.

### Phase 5: Apply edits

1. **`navConfig.tsx`:** rewrite the `navEntries` array in place. Preserve the file's imports,
   interfaces, `navItems`, `getVisibleNavItems`, and exports. Change only the array body. Add
   `NavSeparator` entries (`{ label: 'Infrastructure', type: 'separator' }`) between clusters if the
   decision selected Option B or separator rendering is already present upstream.
2. **Icon imports:** after rewriting, add any new icon imports (alphabetized within the existing `lucide-react` import) and remove any icon that is no longer referenced. Do not leave dead imports.
3. **`Sidebar.tsx`:** only if Option B. Render separators as a non-link item: small uppercased label, muted-foreground color, top padding, and no hover state. Template pattern:

    ```text
    {
        visibleNavEntries.map((entry) => {
            if (entry.type === 'separator') {
                return collapsed ? (
                    <Separator className="my-2" key={entry.label} />
                ) : (
                    <div
                        className="text-muted-foreground px-3 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase"
                        key={entry.label}>
                        {entry.label}
                    </div>
                );
            }
            // ...existing NavItem branch
        });
    }
    ```

    Source the list from a new `getVisibleNavEntries` helper in `navConfig.tsx` that mirrors `getVisibleNavItems` but keeps separators. Filter empty trailing or leading separators and collapse adjacent separators that have nothing visible between them due to role or feature gates.

4. **`MobileNav.tsx`:** apply the equivalent rendering change so mobile and desktop stay in sync. If the mobile nav uses a different visual (drawer or bottom tab bar), style the separator appropriately for that surface. Keep the same label text but adapt the layout.
5. **Label renames:** when a sidebar label is user-visible text, also update unambiguous matching
   `<title>`, breadcrumb, and page-heading references. Preserve ambiguous matches and report them.
6. **Route removals:** this skill does **not** delete routes or pages. It only reorders, relabels,
   regroups, or demotes nav entries. A demoted route remains reachable by URL or in-page links; note
   every demotion in the final report.

### Phase 6: Verify

Per app, after edits:

1. `bun run smoke:qc` in the app directory. Must pass. Fix any issues surfaced (typically unused imports from removed icons, or dead `NavSeparator` typing if Option A was chosen).
2. `bun scripts/crawltest.ts --start-from /` (or the app's equivalent smoke crawl). Nav changes don't usually introduce runtime errors, but crawltest catches orphaned links and broken routes.
3. **Visual confirmation:** start the dev server. Do not report success without seeing the rendered sidebar. Confirm collapsed mode, expanded mode, and the mobile drawer:
    - New cluster order matches the proposal
    - Separators render with correct styling (Option B) or are absent with correct spacing (Option A)
    - Icons align with labels and are all `size-5`
    - Active-route highlight still works
    - Role-gated and feature-flag-gated items still hide correctly when those conditions apply
4. Update the `.aidd/screen-map.md` Primary Navigation paragraph if present. The comma-joined label
   list should reflect the new order. The `update-screen-map` skill will also reconcile this on its
   next run, but it is inexpensive to do now.

### Phase 7: Final report

Emit per app (and a combined summary when multiple apps were processed):

```
ui-organize: {appname}

Purpose:         {one-liner from AGENTS.md}
Render mode:     Option A (reorder only) | Option B (separators rendered)

Nav entries:     {before} → {after}
Clusters:        {0 to N}: {cluster names, comma-joined}
Moves:           {N}
Renames:         {N}:      {old to new, ...}
Removals:        {N}:      {removed labels}
Icon fixes:      {N}:      {specific changes if any}

Files edited:
  - frontend/src/components/layout/navConfig.tsx
  - frontend/src/components/layout/Sidebar.tsx      (if Option B)
  - frontend/src/components/layout/MobileNav.tsx    (if Option B)
  - frontend/src/pages/...                          (only if a rename required a page-heading update)
  - .aidd/screen-map.md                             (if Primary Navigation prose was refreshed)

Verification:    smoke:qc {pass|fail}, crawltest {pass|fail}, dev-server visual check {pass|fail}
```

## Principles

1. **Purpose-first.** Every reorganization starts from the app's AGENTS.md one-liner. If the primary domain of the app isn't the first visible cluster after Home, something is wrong.
2. **Frequency beats alphabet.** Sort by how often a user reaches for the item, not by label. Within a cluster, workflow order beats alphabet.
3. **Admin last.** Settings, Onboarding, Workspaces, and anything ADMIN-gated sit at the end, always.
4. **Clusters of 3-7.** One-item clusters collapse back into the flow. Clusters of 8+ split or demote items.
5. **No renaming without consequence tracking.** A sidebar label rename is a user-visible product decision. Grep for every occurrence before editing. Flag ambiguous matches.
6. **No new routes, no route deletions.** This skill is purely layout. Route-shape changes are out
   of scope; preserve the page and route, apply only the navigation demotion, and report the boundary.
7. **Template drift is explicit.** Any change to `Sidebar.tsx` / `MobileNav.tsx` is app-local drift from the Spernakit template. Call it out. If the same pattern keeps recurring across apps (3+ apps select Option B), report it as an upstream candidate. Do not let this skill quietly introduce template drift in every app.
8. **Smoke gate is non-negotiable.** A rearranged nav with a failing `smoke:qc` is a regression, not a simplification. Do not report success without a clean gate and a visual confirmation.
9. **One app at a time.** Multi-app invocations still run sequentially. Each app gets its own report,
   apply, and verification cycle.
10. **Inference over TODO.** Settings always goes last. For ambiguous groupings, choose the option
    best supported by route usage and the app purpose; preserve labels when rename evidence is weak.

## Notes

- **Spernakit Lite variants** (for example, lightweight journal or notes apps) typically lack a sidebar / navConfig. Skip them and note this in the final report.
- **Non-Spernakit apps** (for example, CLI tools, standalone sites, or control panels) have their own navigation patterns. This skill is scoped to Spernakit and Spernakit Lite. Skip and note.
- **Feature flags in nav:** preserve every `featureFlag` field verbatim during reorders. A dropped flag silently enables a feature in production.
- **Role gates:** preserve every `minRole` value verbatim. A `VIEWER` accidentally seeing an `ADMIN`-gated link is an authorization regression. Do not introduce it here.
- **Icons:** prefer icons already imported in the file when a swap is needed to minimize import churn. Only add an icon when the existing set genuinely does not fit.
- **Relationship to other skills:** run `update-screen-map` after this skill, or let the next natural
  invocation pick it up. The Primary Navigation prose and Route Map order will then reflect the new
  layout. Do not run `page-header-audit` as part of this skill; page headings and sidebar navigation
  are separate concerns.
