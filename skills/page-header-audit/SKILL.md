---
name: page-header-audit
description: 'Find pages in a Spernakit-derived app using manual heading markup instead of the shared PageHeader component and migrate them to the standard pattern. Use for consistent page headers, PageHeader adoption, or standardizing display typography across pages.'
metadata:
    aidd-category: audit-remediation
---

# Page Header Consistency Audit

Scan a Spernakit-derived application for pages that use manual heading markup instead of the shared `PageHeader` component, then migrate them to the standard pattern so all pages share consistent display typography, layout, and responsive behavior.

## Usage

```
page-header-audit [appname]
```

## Context

The Spernakit template provides a `PageHeader` shared component at `frontend/src/components/shared/PageHeader.tsx` that renders a consistent page heading with:

- `text-display` class on the title (uses `--font-display`, 2.25rem, line-height 1.1)
- `text-lead` class on the description (1rem, muted-foreground color)
- Responsive flex layout with bottom border separator
- Optional icon, eyebrow label, and trailing action slot (children)

App-specific pages frequently use manual `<h1 className="text-2xl font-bold">` + `<p className="text-muted-foreground">` markup instead, which produces a jarring visual inconsistency with template pages that use `PageHeader`.

## Instructions

### Phase 1: Discover Divergent Pages

1. **Find all pages using `PageHeader` already** (these establish the correct baseline):

    ```
    grep -rn "PageHeader" frontend/src/pages/ --include="*.tsx" -l
    ```

2. **Find all pages using manual `text-2xl font-bold` h1 headings** (candidates for migration):

    ```
    grep -rn 'text-2xl font-bold' frontend/src/pages/ --include="*.tsx"
    ```

3. **Filter to page-level headings only.** Exclude:
    - Widget stat values (e.g., `<div className="text-2xl font-bold tabular-nums">` inside cards)
    - Non-page components (small reusable pieces that aren't full-page layouts)

    A page-level heading is typically: `<h1 className="text-2xl font-bold">Page Title</h1>` inside a top-level `<div className="space-y-6 p-6">` container.

4. **Report** the count:
    - Pages already using PageHeader: N
    - Pages with manual headings to migrate: N (list each with file path and current title text)

### Phase 2: Read the PageHeader Component

Read `frontend/src/components/shared/PageHeader.tsx` to confirm its current interface:

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

Also read `frontend/src/tailwind.css` to confirm the custom text classes exist:

- `.text-display`: display font, 2.25rem
- `.text-lead`: 1rem, muted-foreground
- `.text-eyebrow`: small caps, 600 weight

### Phase 3: Migrate Each Page

For each page identified in Phase 1, apply the following transform:

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

1. Add the `PageHeader` import to each modified file:

    ```tsx
    import { PageHeader } from '@/components/shared/PageHeader';
    ```

2. Remove any now-unused imports (e.g., if the flex wrapper divs used icons that are no longer needed).

3. Run `bun run typecheck` to verify no type errors.

4. Run `bun run lint:fix` to clean up any lint warnings.

5. Run `bun run smoke:qc` to verify the full quality gate passes.

6. **Visual check** (recommended): Start the dev server and visually compare a few migrated pages against a template page (e.g., `/dashboards` or `/workspaces`) to confirm the heading style matches.

### Phase 5: Report

```
PageHeader Audit Complete: {appname}

Already using PageHeader: {N} pages
Migrated to PageHeader:   {N} pages
Skipped (non-page h1s):   {N} occurrences

Migrated pages:
  - {path}: "{title}"
  - {path}: "{title}"
  ...
```

## Principles

1. **Visual consistency**: Every page-level heading should use the same `text-display` / `text-lead` typography. Manual `text-2xl font-bold` produces visibly different sizing and font-family.
2. **Do not over-convert**: Widget stats, card headings, dialog titles, and inline headings should NOT use PageHeader. It is only for the top-of-page title block.
3. **Preserve behavior**: Action buttons, conditional descriptions, and page-specific controls must work identically after migration. Only the heading markup changes.
4. **Loading states are exempt**: Brief loading skeletons don't need PageHeader since they're replaced within milliseconds.
