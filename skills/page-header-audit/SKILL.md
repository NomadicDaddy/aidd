---
name: page-header-audit
description: 'Find pages using manual heading markup instead of the app’s shared page-header component and migrate them to the standard pattern. Use for consistent page headers, PageHeader adoption, or standardizing display typography across pages.'
metadata:
    aidd-category: audit-remediation
---

# Page Header Consistency Audit

Scan an application for pages that use manual heading markup instead of its shared page-header component, then migrate them to the standard pattern so all pages share consistent display typography, layout, and responsive behavior.

## Usage

```
page-header-audit [app]
```

## Applicability

**Applies to any project with a component-based frontend**, whatever the stack. The one genuine
precondition is that the app already has a **shared page-header component** — that component defines
the target pattern, and without it there is nothing to migrate toward. Discover it by role (Phase 0);
do not require a particular framework, file path, or CSS system. If the app has no such component,
say so plainly and stop: that is the real reason to decline, not the app's provenance.

The React + Tailwind markup throughout this skill is illustrative, drawn from the most common case.
Read the target's own component and page code and adapt the transforms to its markup language.

## Context

Spernakit-derived apps are the canonical example: the template provides `PageHeader` at
`frontend/src/components/shared/PageHeader.tsx`, rendering a consistent page heading with:

- `text-display` class on the title (uses `--font-display`, 2.25rem, line-height 1.1)
- `text-lead` class on the description (1rem, muted-foreground color)
- Responsive flex layout with bottom border separator
- Optional icon, eyebrow label, and trailing action slot (children)

Other stacks name and place the component differently — `PageTitle`, `PageHead`, `Hero`, a layout
slot, an Astro or Vue single-file component — and that is fine. What matters is that one shared
component owns the top-of-page title block.

App-specific pages frequently use manual `<h1 className="text-2xl font-bold">` + `<p className="text-muted-foreground">` markup instead, which produces a jarring visual inconsistency with the pages that use the shared component.

## Instructions

### Phase 0: Locate the component and the page tree

Identify both by role, not filename. Record what you found and use those paths for the rest of the run.

1. **The shared page-header component.** Search the frontend source for a component whose job is the
   top-of-page title block: names like `PageHeader`, `PageTitle`, `PageHead`, or `PageHeading`, usually
   under a shared/common/ui directory (`components/shared/`, `components/ui/`, `components/layout/`,
   `lib/components/`). Confirm by reading it: it should take a title and render the page's `h1`. If
   several candidates exist, pick the one the most pages already import.

    If no such component exists, stop and report: "no shared page-header component found — nothing to
    migrate toward." Creating one is a design decision outside this audit's scope; name it as the
    recommended next step and leave the code untouched.

2. **The page/route tree.** Commonly `frontend/src/pages/`; also `src/pages/`, `src/routes/`,
   `src/views/`, or `app/`. Use the extensions the project actually uses (`.tsx`, `.jsx`, `.vue`,
   `.svelte`, `.astro`).

### Phase 1: Discover Divergent Pages

Substitute the component name, page directory, and extensions found in Phase 0 for the placeholders below.

1. **Find all pages using `{Component}` already** (these establish the correct baseline):

    ```
    grep -rn "{Component}" {page-dir} --include="*.{ext}" -l
    ```

2. **Find page-level headings that bypass it** (candidates for migration). Read one baseline page
   first, then search for the manual pattern it replaces. In Tailwind codebases that is typically:

    ```
    grep -rn 'text-2xl font-bold' {page-dir} --include="*.{ext}"
    ```

    In a project with a different CSS system, search for the page-level heading element itself
    (`<h1`) in the page tree and subtract the files from step 1. The heading element is the reliable
    signal; the utility-class string is a convenience for the common case.

3. **Filter to page-level headings only.** Exclude:
    - Widget stat values (e.g., `<div className="text-2xl font-bold tabular-nums">` inside cards)
    - Non-page components (small reusable pieces that aren't full-page layouts)

    A page-level heading is typically: `<h1 className="text-2xl font-bold">Page Title</h1>` inside a top-level `<div className="space-y-6 p-6">` container.

4. **Report** the count:
    - Pages already using PageHeader: N
    - Pages with manual headings to migrate: N (list each with file path and current title text)

### Phase 2: Read the component's interface

Read the component located in Phase 0 and record its **actual** props or slots — never assume the
shape below. Migrate only into props it really has; a description or icon the component does not
accept must stay as its original markup rather than being dropped.

The Spernakit `PageHeader` is representative:

```typescript
interface PageHeaderProps {
	children?: ReactNode; // Trailing action slot (buttons, dropdowns)
	className?: string; // Additional classes on outer wrapper
	description?: ReactNode; // Subtitle below the title
	eyebrow?: string; // Small caps label above the title
	icon?: LucideIcon; // Icon badge to the left of the title
	title: ReactNode; // The page title (h1)
}
```

If the component depends on custom typography classes, confirm they are defined in the project's
stylesheet before relying on them. In Spernakit that means `.text-display`, `.text-lead`, and
`.text-eyebrow` in `frontend/src/tailwind.css`.

### Phase 3: Migrate Each Page

For each page identified in Phase 1, apply the transform below. The examples are React/JSX; in
another markup language keep the shape — replace the hand-built title block with the shared
component, map the title, description, and action slot onto its real props or slots, and change
nothing else — and follow the target's own syntax and conventions.

#### Standard page (static title, optional actions)

**Before:**

```tsx
<div className="space-y-6 p-6">
	<div className="flex items-center justify-between ...">
		<div>
			<h1 className="text-2xl font-bold">Page Title</h1>
			<p className="mt-1 text-muted-foreground">Description text</p>
		</div>
		<div className="flex items-center gap-2">
			<Button>Action</Button>
		</div>
	</div>
	{/* rest of page */}
</div>
```

**After:**

```tsx
<div className="space-y-6 p-6">
	<PageHeader description="Description text" title="Page Title">
		<Button>Action</Button>
	</PageHeader>
	{/* rest of page */}
</div>
```

#### Dynamic title (detail pages)

**Before:**

```tsx
<h1 className="text-2xl font-bold">{item.name}</h1>
```

**After:**

```tsx
<PageHeader description={item.subtitle} title={item.name}>
	<Button>Edit</Button>
</PageHeader>
```

#### Dynamic description (counts, status)

**Before:**

```tsx
<p className="mt-1 text-muted-foreground">All runs {total > 0 && `(${total} total)`}</p>
```

**After:**

```tsx
<PageHeader
	description={<>All runs {total > 0 && <span>({total} total)</span>}</>}
	title="Run History"
/>
```

#### Loading/empty states with duplicate h1

Many pages render a simplified heading in loading or empty states. **Only convert the primary loaded-state heading.** Leave loading skeleton headings and empty-state headings as-is. They render briefly and do not need the full PageHeader treatment.

### Phase 4: Verify

1. Import the component into each modified file, copying the import style and path alias an existing
   baseline page uses rather than composing one. In Spernakit that is:

    ```tsx
    import { PageHeader } from '@/components/shared/PageHeader';
    ```

2. Remove any now-unused imports (e.g., if the flex wrapper divs used icons that are no longer needed).

3. **Run the project's own gates**, discovered from its manifest rather than assumed. If the project
   defines an aggregate gate (`smoke:qc` in Bun/npm projects), prefer it — it covers the individual
   checks. Otherwise run whatever it defines for type checking, linting, and build, and say in the
   report which gates were available and which ran.

4. **Visual check** (recommended): start the dev server and compare a few migrated pages against a
   baseline page from Phase 1 to confirm the heading style matches.

### Phase 5: Report

```
Page Header Audit Complete: {appname}

Shared component: {Component} ({path})
Already using it:  {N} pages
Migrated:          {N} pages
Skipped (non-page headings): {N} occurrences
Gates run: {list, or "none defined"}

Migrated pages:
  - {path}: "{title}"
  - {path}: "{title}"
  ...
```

## Principles

1. **Visual consistency**: Every page-level heading should use the shared component's typography. Hand-rolled heading markup produces visibly different sizing and font-family.
2. **Do not over-convert**: Widget stats, card headings, dialog titles, and inline headings should NOT use the page-header component. It is only for the top-of-page title block.
3. **Preserve behavior**: Action buttons, conditional descriptions, and page-specific controls must work identically after migration. Only the heading markup changes.
4. **Loading states are exempt**: Brief loading skeletons don't need the shared component since they're replaced within milliseconds.
5. **Migrate toward what exists**: The target pattern is the app's own component and its real props, discovered in Phases 0-2 — never an idealized interface this skill describes.
