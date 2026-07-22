---
title: 'Web Interface Guidelines Audit (Vercel)'
last_updated: '2026-07-21'
version: '1.6'
category: 'Frontend'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'Monthly'
lifecycle: 'active'
---

# Web Interface Guidelines Audit

Based on
[Vercel's Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/tree/4e799d45c17aec1498c269287a83b9dba22b966b),
synchronized against `vercel-labs/web-interface-guidelines@4e799d4`. Companion audit to
[REACT_BEST_PRACTICES.md](./REACT_BEST_PRACTICES.md) and
[COMPOSITION_PATTERNS.md](./COMPOSITION_PATTERNS.md).

Comprehensive UI quality and accessibility guide covering all 93 upstream checks across 17
categories, plus one aidd-specific manual color-contrast check. It covers accessibility, forms,
animation, typography, performance, navigation, theming, and interaction patterns.

## Executive Summary

**Target Audience**: Frontend developers building user-facing web interfaces

**Core Principle**: Web interfaces should be accessible, performant, and polished. Semantic HTML, proper ARIA attributes, keyboard support, and visual consistency are non-negotiable foundations - not afterthoughts.

**Key Priorities**

- **Accessibility first**: Semantic HTML, ARIA labels, keyboard navigation, focus management
- **Form UX**: Correct input types, autocomplete, inline errors, paste support
- **Performance**: Virtualized lists, preloaded fonts, lazy images, no layout thrashing
- **Visual polish**: Proper typography, dark mode, animation, responsive layout

**Impact Levels**

- **CRITICAL**: Accessibility violations (screen reader breakage, keyboard traps)
- **HIGH**: Form UX, performance, navigation, focus states
- **MEDIUM**: Animation, theming, content handling, and typography that affects readability or data comparison
- **LOW**: Copy style, punctuation-only typography polish, minor visual polish

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Spernakit Applicability

This audit fully applies to spernakit applications (React 19 + Vite). All categories are relevant except Section 14 (Hydration Safety) which is SSR-only.

### React Compiler / Tailwind CSS 4 Note

`babel-plugin-react-compiler` does NOT affect any of these 93 rules - they are all DOM/HTML/CSS concerns, not render optimization concerns. Tailwind CSS 4.3.x uses CSS-first configuration with `@theme` directive; `focus-visible:ring-*` and `text-wrap` utilities work differently from v3 - verify Tailwind v4 syntax when checking rules in Sections 2 (Focus States) and 5 (Typography).

### Spernakit-Specific Notes

| Guideline Area                          | Spernakit Context                                                                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration safety                        | Spernakit is a client SPA - no SSR hydration. Rules 69-71 are N/A.                                                                                                                       |
| `<Link>` component                      | Use React Router's `<Link>` (not Next.js `<Link>`)                                                                                                                                       |
| Dark mode                               | Spernakit uses shadcn/ui theme system with Zustand persist                                                                                                                               |
| Toasts                                  | Use sonner via shadcn/ui (already has `aria-live` support)                                                                                                                               |
| URL state                               | Use React Router `useSearchParams` or a library like nuqs                                                                                                                                |
| Font loading                            | Handled in `index.html` - ensure `<link rel="preload">` and `font-display: swap`                                                                                                         |
| Date/number formatting (13.1, 13.2)     | Use `useFormatters` (`hooks/useFormatters.ts`) - user-preference-aware `Intl.DateTimeFormat`/`Intl.NumberFormat`. Flag "not using `useFormatters`" rather than hand-rolled `Intl` calls. |
| Unsaved-changes warning (3.11)          | Use `useUnsavedChanges` (`hooks/useUnsavedChanges.ts`) - browser `beforeunload` + React Router blocker.                                                                                  |
| Pagination / filter URL sync (9.1, 9.3) | Use `usePagination({ syncToUrl })` (`hooks/usePagination.ts`) and `useUrlFilters` (`hooks/useUrlFilters.ts`) - URL-synced pagination with filter params and auto page reset.             |
| Theme-color + color-scheme (12.1, 12.2) | Use `useTheme` (`hooks/useTheme.ts`) - manages the `<meta name="theme-color">` tag and the `color-scheme` CSS property on theme change.                                                  |
| Virtualization (8.1)                    | Spernakit ships built-in virtual scrolling for large datasets (10,000+ items). Prefer the in-template primitive over adding a redundant third-party virtualizer.                         |

## Table of Contents

1. [Accessibility](#1-accessibility) - **CRITICAL**
2. [Focus States](#2-focus-states) - **HIGH**
3. [Forms](#3-forms) - **HIGH**
4. [Animation](#4-animation) - **MEDIUM**
5. [Typography](#5-typography) - **MEDIUM**
6. [Content Handling](#6-content-handling) - **MEDIUM**
7. [Images](#7-images) - **HIGH**
8. [Performance](#8-performance) - **HIGH**
9. [Navigation & State](#9-navigation--state) - **HIGH**
10. [Touch & Interaction](#10-touch--interaction) - **MEDIUM**
11. [Safe Areas & Layout](#11-safe-areas--layout) - **LOW**
12. [Dark Mode & Theming](#12-dark-mode--theming) - **MEDIUM**
13. [Locale & i18n](#13-locale--i18n) - **MEDIUM**
14. [Hydration Safety](#14-hydration-safety) - **LOW** (N/A for spernakit)
15. [Hover & Interactive States](#15-hover--interactive-states) - **MEDIUM**
16. [Content & Copy](#16-content--copy) - **LOW**
17. [Anti-patterns](#17-anti-patterns) - **HIGH**

---

## Pre-Audit Setup

Before beginning the audit, prepare search commands to identify web interface guideline violations in the target codebase:

1. **Run quality checks**: `bun run smoke:qc` must pass to establish a clean baseline.
2. **Verify Tailwind CSS v4**: Confirm `tailwindcss` in `frontend/package.json` is v4.x with `@tailwindcss/vite` plugin.
3. **Identify icon-library accessibility defaults**: Record each icon component library and
   its installed version. Inspect the rendered DOM or that exact version's implementation before
   treating an absent JSX `aria-hidden` prop as a violation.
4. **Scan for missing aria-labels on icon buttons**:
    ```bash
    rg "<button[^>]*>\s*<\w+Icon" frontend/src/ -g '*.tsx'
    ```
5. **Scan for images without alt text**:
    ```bash
    rg "<img[^>]*(?!alt=)" frontend/src/ -g '*.tsx'
    ```
6. **Scan for outline-none without focus-visible replacement**:
    ```bash
    rg "outline-none|outline:\s*none" frontend/src/ -A 5 -g '*.tsx' --type css
    ```
7. **Scan for transition: all**:
    ```bash
    rg "transition:\s*all|transition-all" frontend/src/
    ```
8. **Scan for div onClick navigation**:
    ```bash
    rg "div.*onClick.*navigate" frontend/src/ -g '*.tsx'
    ```
9. **Scan for hardcoded date/number formats**:
    ```bash
    rg "toFixed\(|getMonth\(|getFullYear\(" frontend/src/ --type ts
    ```
10. **Scan for missing image dimensions**:
    ```bash
    rg "<img" frontend/src/ -g '*.tsx' | rg -v "width.*height|height.*width"
    ```

---

## 1. Accessibility

**Impact: CRITICAL**

Accessibility violations break the experience for screen reader users, keyboard-only users, and assistive technology. These are not optional polish items.

### 1.1 Icon-Only Buttons Need aria-label

Every button that contains only an icon (no visible text) must have an `aria-label` describing its action.

```tsx
// Incorrect
<button><TrashIcon /></button>

// Correct
<button aria-label="Delete item"><TrashIcon /></button>
```

### 1.2 Form Controls Need Labels

Every `<input>`, `<select>`, and `<textarea>` needs a visible `<label>` or `aria-label`.

```tsx
// Incorrect
<input type="email" placeholder="Email" />

// Correct
<label htmlFor="email">Email</label>
<input id="email" type="email" placeholder="you@example.com" />
```

### 1.3 Interactive Elements Need Keyboard Handlers

Elements with `onClick` must also handle `onKeyDown`/`onKeyUp` for keyboard users. Prefer semantic `<button>` (which handles this natively) over `<div onClick>`.

### 1.4 Semantic Buttons vs Links

Use `<button>` for actions (submit, delete, toggle). Use `<a>`/`<Link>` for navigation. Never use `<div onClick>` for either.

```tsx
// Incorrect
<div onClick={() => navigate('/settings')}>Settings</div>

// Correct
<Link to="/settings">Settings</Link>
```

### 1.5 Image Alt Text

All `<img>` elements need `alt` text. Use `alt=""` for purely decorative images.

### 1.6 Decorative Icons Need aria-hidden

Icons used purely for decoration (next to text that already conveys meaning) must be absent from
the accessibility tree. Raw SVGs and icon components that do not provide this behavior need an
explicit `aria-hidden="true"`.

Do not infer a violation solely because authored JSX omits the attribute. Verify the rendered DOM
or the exact installed component-library implementation. If the icon conveys meaning, give it an
accessible name instead of hiding it.

```tsx
<span>
	<CheckIcon aria-hidden="true" /> Saved
</span>
```

> **Spernakit note**: Lucide React 1.24.0 adds `aria-hidden="true"` automatically when an icon
> receives neither children nor an accessibility prop. Lucide treats `aria-*`, `role`, and `title`
> as accessibility props; those props or children suppress the automatic fallback. Verify the
> resulting semantics before filing a finding, and require an explicit `aria-hidden` only when a
> decorative icon is not otherwise hidden from the accessibility tree.

### 1.7 Async Updates Need aria-live

Toast notifications, validation messages, and async status updates need `aria-live="polite"` to announce changes to screen readers.

> **Spernakit note**: sonner (via shadcn/ui) handles this automatically for toasts. Ensure custom inline validation messages also use `aria-live`.

### 1.8 Semantic HTML Over ARIA

Use semantic HTML elements (`<nav>`, `<main>`, `<aside>`, `<header>`, `<footer>`, `<section>`) before reaching for ARIA roles. ARIA is a last resort, not a first choice.

### 1.9 Heading Hierarchy

Maintain proper `<h1>` - `<h6>` structure. Don't skip levels. Include a skip-to-content link for keyboard users.

### 1.10 Heading Anchor Margins

When headings are anchor targets, apply `scroll-margin-top` to prevent the heading from hiding behind sticky headers.

```css
h2[id] {
	scroll-margin-top: 4rem;
}
```

### 1.11 Color Contrast (Manual Verification)

Text and interactive elements must meet WCAG 2.1 AA contrast ratios: **4.5:1** for normal text, **3:1** for large text (≥18.66px bold or ≥24px) and for UI component/graphic boundaries. This is **not statically greppable** - verify manually (or with a browser/axe DevTools pass) on representative pages, paying special attention to: muted/secondary text on tinted backgrounds, placeholder text, disabled-state legibility, and text over images or gradients. Check **both** light and dark themes, since a token that passes in one often fails in the other.

> **Spernakit note**: Contrast is governed by the shadcn/ui theme tokens (CSS custom properties). When a contrast failure is found, fix it at the token level (`--muted-foreground`, `--border`, etc.) rather than per-component, so the fix applies everywhere. Severity: **High** for body/control text that fails AA; **Medium** for decorative or large-text near-misses.

---

## 2. Focus States

**Impact: HIGH**

Focus indicators are essential for keyboard navigation. Missing or invisible focus states make the app unusable for keyboard users.

### 2.1 Visible Focus Indicators

All interactive elements must have visible focus indicators. Use `focus-visible:ring-*` (Tailwind) or equivalent.

### 2.2 Never Remove Outline Without Replacement

Never use `outline-none` / `outline: none` without providing an alternative focus indicator.

```css
/* Incorrect */
button {
	outline: none;
}

/* Correct */
button:focus-visible {
	outline: 2px solid var(--ring);
	outline-offset: 2px;
}
```

### 2.3 Prefer :focus-visible Over :focus

`:focus-visible` shows the focus ring on keyboard navigation but suppresses it on mouse click - better UX.

### 2.4 Compound Control Focus

Use `:focus-within` on compound controls (input groups, custom selects) to show focus on the container.

---

## 3. Forms

**Impact: HIGH**

Form UX directly impacts conversion rates and user satisfaction. Bad forms drive users away.

### 3.1 Input Autocomplete

Provide `autocomplete` attribute with meaningful `name` on login/signup/payment fields.

```tsx
<input name="email" type="email" autoComplete="email" />
<input name="cc-number" type="text" autoComplete="cc-number" />
```

### 3.2 Correct Input Types

Use semantic input types and `inputMode` for mobile keyboard optimization.

```tsx
<input type="email" />          {/* Shows @ key on mobile */}
<input type="tel" />             {/* Shows phone keypad */}
<input type="url" />             {/* Shows .com key */}
<input inputMode="numeric" />    {/* Shows number pad */}
```

### 3.3 Never Prevent Paste

Never block paste via `onPaste` + `preventDefault`. Users paste passwords, verification codes, and addresses.

### 3.4 Clickable Labels

Labels must be associated with their control via `htmlFor` or by wrapping the input.

### 3.5 Disable Spellcheck on Non-Prose Fields

Disable spellcheck on emails, codes, usernames, URLs.

```tsx
<input type="email" spellCheck={false} />
```

### 3.6 Checkbox/Radio Hit Targets

Label and control must share a single hit target with no dead zones between them.

### 3.7 Submit Button State

Keep the submit button enabled until the request starts. Show a spinner during the request. Don't disable on initial render.

### 3.8 Inline Error Placement

Display validation errors inline, adjacent to the field. On submit, focus the first error field.

### 3.9 Placeholder Guidance

Placeholders should end with `…` and show an example pattern, not repeat the label.

```tsx
<input placeholder="you@company.com…" />
```

### 3.10 Non-Auth Fields: autocomplete="off"

Use `autocomplete="off"` on fields that aren't login/signup to avoid password manager interference.

### 3.11 Unsaved Changes Warning

Warn before navigating away from forms with unsaved changes using `beforeunload` or router guards.

---

## 4. Animation

**Impact: MEDIUM**

Smooth, respectful animations enhance UX. Bad animations cause jank, accessibility issues, and wasted battery.

### 4.1 Respect prefers-reduced-motion

Honor the user's `prefers-reduced-motion` preference. Provide an alternative or disable animations entirely.

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

### 4.2 Animate Only transform and opacity

These are compositor-friendly properties that don't trigger layout or paint. Avoid animating `width`, `height`, `top`, `left`, `margin`, `padding`.

### 4.3 Never Use transition: all

List specific properties explicitly. `transition: all` animates unintended properties and hurts performance.

```css
/* Incorrect */
transition: all 0.2s;

/* Correct */
transition:
	opacity 0.2s,
	transform 0.2s;
```

### 4.4 Set Correct transform-origin

Ensure `transform-origin` matches the visual pivot point of the animation.

### 4.5 SVG Animation

Apply transforms to a `<g>` wrapper, not the SVG element directly. Use `transform-box: fill-box; transform-origin: center`.

### 4.6 Interruptible Animations

Animations must respond to user input mid-animation. Don't lock out interaction during transitions.

---

## 5. Typography

**Impact: MEDIUM**

Typography details separate polished interfaces from amateur ones.

### 5.1 Use Proper Ellipsis Character

Use the Unicode ellipsis character (`\u2026` / `&hellip;` / `…`), not three ASCII periods (`...`).

Severity threshold: ASCII ellipsis is LOW when it is isolated punctuation polish in
ordinary copy or a screen-reader-only description. Treat it as MEDIUM only when it
appears in loading/status text, placeholder guidance, repeated user-facing UI copy,
or enough visible surfaces to make the interface look inconsistent.

> **Default-severity note**: This is a LOW-by-default rule. The same threshold applies
> wherever this rule appears - the Audit Checklist and Section 17 Anti-patterns. Do not
> escalate isolated ASCII ellipsis to MEDIUM/HIGH from the checklist path; only the
> loading/status/placeholder/repeated-copy cases above raise it to MEDIUM.

### 5.2 Use Curly Quotes

Use `\u201c` `\u201d` (curly quotes), not straight `"` quotes, in user-facing copy.

### 5.3 Non-Breaking Spaces

Apply `&nbsp;` in amounts (`10&nbsp;MB`), keyboard shortcuts (`\u2318&nbsp;K`), and brand names to prevent awkward line breaks.

### 5.4 Loading State Copy

Loading text should end with `…`: "Loading…", "Saving…", "Deploying…".

### 5.5 Tabular Numbers

Apply `font-variant-numeric: tabular-nums` for number columns, tables, and anywhere numbers are compared visually.

```css
.stats {
	font-variant-numeric: tabular-nums;
}
```

### 5.6 Heading Text Wrapping

Use `text-wrap: balance` or `text-wrap: pretty` on headings to prevent widows (single words on the last line).

---

## 6. Content Handling

**Impact: MEDIUM**

UI must handle real-world content - not just happy-path design mockups.

### 6.1 Long Text Overflow

Containers with user-generated content must handle overflow via `truncate`, `line-clamp-*`, or `break-words`.

### 6.2 Flex Truncation

Flex children need `min-w-0` to allow text truncation to work.

```tsx
<div className="flex">
	<span className="min-w-0 truncate">{longText}</span>
</div>
```

### 6.3 Empty State Handling

Never render broken UI for empty strings or empty arrays. Show meaningful empty states.

### 6.4 Content Variability

Design for short, average, and very long user inputs. Test with real-world edge cases.

---

## 7. Images

**Impact: HIGH**

Images are the most common cause of layout shift and slow page loads.

### 7.1 Explicit Image Dimensions

Every `<img>` needs explicit `width` and `height` to prevent Cumulative Layout Shift (CLS).

```tsx
<img src="/avatar.jpg" width={48} height={48} alt="User avatar" />
```

### 7.2 Lazy Load Below-Fold Images

Images below the fold should use `loading="lazy"`.

```tsx
<img src="/feature.jpg" loading="lazy" width={800} height={400} alt="Feature screenshot" />
```

### 7.3 Critical Image Priority

Above-fold hero images should use `fetchpriority="high"` to load first.

```tsx
<img src="/hero.jpg" fetchPriority="high" width={1200} height={600} alt="Hero" />
```

---

## 8. Performance

**Impact: HIGH**

Performance issues directly impact user experience and Core Web Vitals scores.

### 8.1 Virtualize Large Lists

Lists with >50 items should use virtualization (`virtua`, `@tanstack/react-virtual`, or `content-visibility: auto`).

> **Spernakit note**: The template ships built-in virtual scrolling for large datasets (10,000+ items) - prefer the in-template primitive over adding a redundant third-party virtualizer to a small, single-team self-hosted tool. Treat the >50-item count as guidance, not a hard threshold: the cost-benefit of virtualization scales with row complexity and total rows, so do not flag a modest, paginated table as a violation.

### 8.2 No Layout Reads in Render

Never call `getBoundingClientRect()`, `offsetHeight`, `offsetWidth`, or `scrollTop` during render. These force synchronous layout.

### 8.3 Batch DOM Operations

Batch DOM reads and writes. Never interleave reads between writes (causes layout thrashing).

### 8.4 Uncontrolled Inputs When Possible

Prefer `defaultValue` (uncontrolled) over `value` + `onChange` (controlled) for inputs. Controlled inputs must be cheap per keystroke.

### 8.5 Preconnect to CDN Domains

Add `<link rel="preconnect">` for external domains you fetch from.

```html
<link href="https://fonts.googleapis.com" rel="preconnect" />
<link crossorigin href="https://cdn.example.com" rel="preconnect" />
```

### 8.6 Preload Critical Fonts

Use `<link rel="preload" as="font">` for critical fonts, with `font-display: swap` in the `@font-face` rule.

---

## 9. Navigation & State

**Impact: HIGH**

Proper URL state and navigation patterns enable browser features (back/forward, bookmarks, sharing).

### 9.1 URL Reflects UI State

Filters, tabs, pagination, expanded panels, and sort order should be reflected in URL query params.

### 9.2 Use Semantic Links for Navigation

Use `<a>`/`<Link>` for navigation (enables Cmd/Ctrl+click, middle-click, right-click > Open in new tab).

### 9.3 Sync State to URL

If using `useState` for filters/tabs/pagination, sync to URL via `useSearchParams` or nuqs.

### 9.4 Destructive Action Protection

Destructive actions (delete, remove, reset) require a confirmation modal or undo window. Never execute immediately.

---

## 10. Touch & Interaction

**Impact: MEDIUM**

Touch interaction details matter on mobile and tablet devices.

### 10.1 touch-action: manipulation

Apply to interactive elements to prevent 300ms double-tap zoom delay.

### 10.2 Tap Highlight Color

Set `-webkit-tap-highlight-color` intentionally rather than leaving browser defaults.

### 10.3 Modal Scroll Containment

Modals, drawers, and sheets need `overscroll-behavior: contain` to prevent background scroll.

### 10.4 Drag Selection Prevention

During drag operations, disable text selection on the page and apply `inert` to dragged elements.

### 10.5 autoFocus Sparingly

Use `autoFocus` only on desktop, only on single primary inputs (search, login). Avoid on mobile (keyboard pops up unexpectedly).

---

## 11. Safe Areas & Layout

**Impact: LOW**

Layout rules for robust cross-device rendering.

### 11.1 Notch Accommodation

Full-bleed layouts need `env(safe-area-inset-*)` to avoid content behind notches.

### 11.2 Prevent Unwanted Scrollbars

Use `overflow-x-hidden` on containers where horizontal scroll is not intended.

### 11.3 Prefer CSS Layout Over JS Measurement

Use Flexbox/Grid instead of JavaScript-based measurement and positioning.

---

## 12. Dark Mode & Theming

**Impact: MEDIUM**

Dark mode requires explicit handling beyond swapping colors.

### 12.1 color-scheme: dark

Apply `color-scheme: dark` on `<html>` when in dark mode. This fixes scrollbar colors, input styles, and form controls.

### 12.2 Theme Color Meta Tag

Set `<meta name="theme-color">` to match the page background color. Update it when theme changes.

### 12.3 Native Select Styling

Set explicit `background-color` and `color` on `<select>` elements. Windows dark mode renders native selects with white-on-white without this.

---

## 13. Locale & i18n

**Impact: MEDIUM**

Hardcoded formats break for international users.

### 13.1 Use Intl.DateTimeFormat

Never hardcode date formats. Use `Intl.DateTimeFormat` for locale-aware formatting.

```typescript
// Incorrect
`${date.getMonth()}/${date.getDate()}/${date.getFullYear()}`;

// Correct
new Intl.DateTimeFormat(navigator.language, { dateStyle: 'medium' }).format(date);
```

### 13.2 Use Intl.NumberFormat

Never hardcode number/currency formats. Use `Intl.NumberFormat`.

```typescript
// Incorrect
`$${price.toFixed(2)}`;

// Correct
new Intl.NumberFormat(navigator.language, { style: 'currency', currency: 'USD' }).format(price);
```

### 13.3 Use Accept-Language for Detection

Use `Accept-Language` header or `navigator.languages` for locale detection, not IP-based geolocation.

### 13.4 Prevent Auto-Translation of Code and Brand Names

Brand names, code tokens, API identifiers, and technical terms should be wrapped with `translate="no"` to prevent garbled auto-translation by browser translation features.

```html
<span translate="no">React</span>
<code translate="no">npm install</code>
<span translate="no">Elysia</span>
```

---

## 14. Hydration Safety

**Impact: LOW (N/A for spernakit)**

> **Spernakit note**: These rules apply only to SSR/SSG apps. Spernakit is a client SPA with no hydration phase. Retained for reference when auditing Next.js codebases.

### 14.1 Controlled Input onChange

Inputs with `value` prop must have `onChange` handler (or use `defaultValue`).

> **Note**: This rule applies to spernakit as a general React correctness rule, even without hydration concerns. Also covered in Section 3 (Forms) for completeness.

### 14.2 Date/Time Hydration Guard

Guard against server/client date mismatch in SSR apps.

### 14.3 Suppress Hydration Warnings Sparingly

Use `suppressHydrationWarning` only when the mismatch is intentional and expected.

---

## 15. Hover & Interactive States

**Impact: MEDIUM**

Visual feedback on interaction confirms that elements are interactive.

### 15.1 Hover State Styling

All buttons and links need `hover:` state styling for visual feedback.

### 15.2 Interactive State Contrast

Hover, active, and focus states must be visually more prominent than the base/resting state.

---

## 16. Content & Copy

**Impact: LOW**

Consistent, clear copy improves usability and professionalism.

### 16.1 Active Voice

Use active voice: "Install the CLI" not "The CLI will be installed".

### 16.2 Heading Title Case

Apply Chicago-style Title Case to headings.

### 16.3 Use Numerals for Counts

"8 deployments" not "eight deployments".

### 16.4 Specific Button Labels

"Save API Key" not generic "Continue" or "Submit".

### 16.5 Error Messages Include Next Steps

Error messages must tell the user what to do, not just what went wrong.

```
// Incorrect
"Invalid API key"

// Correct
"Invalid API key. Check that you copied the full key from your dashboard."
```

### 16.6 Second Person Perspective

Address the user as "you". Avoid first person ("I", "we").

### 16.7 Ampersand in Space-Constrained UI

Use `&` instead of "and" in buttons, tabs, and other space-constrained contexts.

---

## 17. Anti-patterns

**Impact: HIGH**

These patterns should be flagged on sight. They indicate accessibility, performance, or UX regressions.

| Anti-pattern                  | What to flag                                             | Fix                               |
| ----------------------------- | -------------------------------------------------------- | --------------------------------- |
| Zoom disable                  | `user-scalable=no` or `maximum-scale=1` in viewport meta | Remove - violates WCAG            |
| Paste prevention              | `onPaste` + `preventDefault`                             | Remove - blocks password managers |
| Transition all                | `transition: all`                                        | List specific properties          |
| Outline removal               | `outline-none` without `focus-visible` replacement       | Add focus-visible ring            |
| Div click navigation          | `<div onClick={() => navigate(...)}>`                    | Use `<Link>`                      |
| Non-semantic interactions     | `<div>` / `<span>` with `onClick`                        | Use `<button>`                    |
| Images without dimensions     | `<img>` missing `width` / `height`                       | Add explicit dimensions           |
| Unvirtualized large lists     | `.map()` over 50+ items without virtualization           | Add virtualization                |
| Unlabeled inputs              | `<input>` without `<label>` or `aria-label`              | Add label                         |
| Unlabeled icon buttons        | Icon-only `<button>` without `aria-label`                | Add aria-label                    |
| Hardcoded date/number formats | Date/number formatting without `Intl.*`                  | Use Intl APIs                     |
| Unjustified autoFocus         | `autoFocus` without clear justification                  | Remove or justify                 |

---

## Audit Checklist

### Critical Issues

**Accessibility**

- [ ] **Critical**: All icon-only buttons have `aria-label`
- [ ] **Critical**: All form controls have visible labels or `aria-label`
- [ ] **Critical**: Interactive elements use semantic HTML (`<button>`, `<a>`) not `<div onClick>`
- [ ] **Critical**: Images have `alt` text (or `alt=""` for decorative)
- [ ] **Critical**: Decorative icons are absent from the accessibility tree through an explicit
      `aria-hidden="true"` or verified library-generated behavior; do not fail Lucide icons from a
      JSX-only scan
- [ ] **Critical**: Heading hierarchy is maintained (`h1`-`h6`, no skipped levels)
- [ ] **Critical**: Async updates use `aria-live` for screen reader announcements
- [ ] **Critical**: No zoom disabled (`user-scalable=no` / `maximum-scale=1`)
- [ ] **High (manual)**: Text/controls meet WCAG AA contrast (4.5:1 normal, 3:1 large/UI) in both light and dark themes - see §1.11

### High Priority Issues

**Focus States**

- [ ] **High**: All interactive elements have visible focus indicators
- [ ] **High**: No `outline-none` without `focus-visible` replacement
- [ ] **High**: `:focus-visible` used instead of `:focus`
- [ ] **High**: Compound controls use `:focus-within`

**Forms**

- [ ] **High**: Login/signup fields have `autocomplete` attribute
- [ ] **High**: Correct input types used (`email`, `tel`, `url`, `number`)
- [ ] **High**: Paste is never prevented
- [ ] **High**: Labels are clickable and associated with controls
- [ ] **High**: Validation errors shown inline, first error focused on submit
- [ ] **High**: Submit button stays enabled, shows spinner during request
- [ ] **High**: Unsaved changes trigger navigation warning

**Images**

- [ ] **High**: All `<img>` have explicit `width` and `height`
- [ ] **High**: Below-fold images use `loading="lazy"`
- [ ] **High**: Critical above-fold images use `fetchpriority="high"`

**Performance**

- [ ] **High**: Lists >50 items use virtualization
- [ ] **High**: No `getBoundingClientRect` / `offsetHeight` in render
- [ ] **High**: DOM reads/writes batched (no layout thrashing)
- [ ] **High**: CDN domains have `<link rel="preconnect">`
- [ ] **High**: Critical fonts preloaded with `font-display: swap`

**Navigation & State**

- [ ] **High**: UI state (filters, tabs, pagination) reflected in URL
- [ ] **High**: Navigation uses `<Link>`, not `<div onClick>`
- [ ] **High**: Destructive actions require confirmation or undo

**Anti-patterns**

- [ ] **High**: No `transition: all` - specific properties listed
- [ ] **High**: No unvirtualized `.map()` over large arrays
- [ ] **High**: No `<div>` / `<span>` with `onClick` as interactive elements

### Medium Priority Issues

**Animation**

- [ ] **Medium**: `prefers-reduced-motion` respected
- [ ] **Medium**: Only `transform` / `opacity` animated
- [ ] **Medium**: Animations are interruptible
- [ ] **Medium**: SVG transforms applied to `<g>` wrapper

**Typography**

- [ ] **Low by default / Medium when repeated or status-related**: Proper ellipsis character (`…` not `...`)
- [ ] **Medium**: Tabular numbers used in data tables / stats
- [ ] **Medium**: `text-wrap: balance` or `pretty` on headings

**Content Handling**

- [ ] **Medium**: Long text overflow handled (truncate, line-clamp, break-words)
- [ ] **Medium**: Flex children have `min-w-0` for truncation
- [ ] **Medium**: Empty states handled gracefully
- [ ] **Medium**: Designs tested with variable-length content

**Touch & Interaction**

- [ ] **Medium**: `touch-action: manipulation` on interactive elements
- [ ] **Medium**: Modal scroll containment (`overscroll-behavior: contain`)
- [ ] **Medium**: `autoFocus` used sparingly, desktop-only

**Dark Mode & Theming**

- [ ] **Medium**: `color-scheme: dark` applied on `<html>` in dark mode
- [ ] **Medium**: `<meta name="theme-color">` set and updated with theme
- [ ] **Medium**: Native `<select>` has explicit background/color

**Locale & i18n**

- [ ] **Medium**: `Intl.DateTimeFormat` used for dates
- [ ] **Medium**: `Intl.NumberFormat` used for numbers/currency
- [ ] **Medium**: Locale detected via `Accept-Language` / `navigator.languages`
- [ ] **Medium**: Brand names, code tokens, and identifiers use `translate="no"`

**Hover & Interactive States**

- [ ] **Medium**: All buttons/links have hover state
- [ ] **Medium**: Hover/active/focus states more prominent than base

### Low Priority Issues

**Content & Copy**

- [ ] **Low**: Active voice used
- [ ] **Low**: Headings use Title Case
- [ ] **Low**: Numerals used for counts
- [ ] **Low**: Button labels are specific (not generic "Submit")
- [ ] **Low**: Error messages include next steps
- [ ] **Low**: Second person perspective ("you")

**Layout**

- [ ] **Low**: Full-bleed layouts use `env(safe-area-inset-*)`
- [ ] **Low**: No unwanted horizontal scrollbars
- [ ] **Low**: CSS layout (Flex/Grid) preferred over JS measurement

---

## Report Template

````markdown
# Web Interface Guidelines Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Medium Priority Issues Found**: [Number]
**Low Priority Issues Found**: [Number]

**Compliance Summary**:

- Accessibility: [Score]/25
- Forms & Input: [Score]/20
- Performance: [Score]/20
- Visual Polish: [Score]/20
- Navigation & State: [Score]/15

## Category Breakdown

### 1. Accessibility (CRITICAL)

**Score**: [Score]/25
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 2. Focus States (HIGH)

**Score**: [Score]/10
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 3. Forms (HIGH)

**Score**: [Score]/15
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 4-17. [Remaining Categories]

[Same format for each category]

## Detailed Findings

### Critical Issues

#### Issue #1: [Title]

- **Severity**: Critical
- **Category**: [Accessibility/Forms/Performance/...]
- **Impact**: [Description]
- **Location**: `path/to/file.tsx:line`
- **Code**:
    ```tsx
    // Current code
    ```
- **Fix**:
    ```tsx
    // Corrected code
    ```
- **Effort Estimate**: [Hours/Days]

### High Priority Issues

[Similar format]

### Medium Priority Issues

[Similar format]

### Low Priority Issues

[Similar format]

## Recommendations

### Immediate Actions (0-7 days)

1. **[Fix critical accessibility violations]**
    - Impact: Screen reader and keyboard users can use the app
    - Effort: [Low/Medium/High]
    - Files: [List of affected files]

2. **[Fix anti-patterns]**
    - Impact: Removes known regressions
    - Effort: Low
    - Files: [List]

### Short-term Actions (1-4 weeks)

1. **[Form UX improvements]**
    - Impact: Better conversion, fewer user errors
    - Effort: [Low/Medium/High]

2. **[Performance optimizations]**
    - Impact: Better Core Web Vitals
    - Effort: [Low/Medium/High]

### Long-term Actions (1-3 months)

1. **[i18n / locale improvements]**
    - Impact: International user support
    - Effort: [Low/Medium/High]

2. **[Typography and copy polish]**
    - Impact: Professional appearance
    - Effort: Low

## Metrics

- **Accessibility violations**: [Count] critical, [Count] high
- **Anti-patterns found**: [Count]
- **Form fields without autocomplete**: [Count]
- **Images without dimensions**: [Count]
- **Unvirtualized large lists**: [Count]
- **Hardcoded date/number formats**: [Count]

## Next Audit Date

Recommended: [Date] (Monthly for active development)

---

**Auditor**: [Name]
**Date**: [Date]
**Pages Reviewed**: [List]
````

## References

- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/tree/4e799d45c17aec1498c269287a83b9dba22b966b) - 93 checks, pinned source material
- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [MDN Accessibility Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [web.dev Core Web Vitals](https://web.dev/vitals/)
- [React Accessibility Docs](https://react.dev/reference/react-dom/components#common-props)

---

**Version**: 1.6
**Last Updated**: 2026-07-21
**Next Review**: 2026-08-21
