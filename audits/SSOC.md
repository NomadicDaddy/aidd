---
title: 'Shared vs Page UI Separation Audit'
last_updated: '2026-01-26'
version: '1.0'
category: 'Frontend'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
---

# Shared vs Page UI Separation Audit

## Purpose

- Provide a quick review checklist to enforce the separation between shared UI in `src/components/...` and page-scoped UI in `src/pages/<route>/...`.

## Directory Rules

- Place reusable UI under `src/components/<domain>/...` (e.g., `src/components/users/UserSecurityModal`).
- Place page-scoped UI under `src/pages/<route>/<domain>/...` (e.g., `src/pages/users/UserTable`).
- Keep domain models in `src/types`; keep page-only composite types in `src/pages/<route>/types.ts`.

## Import Rules

- From a page, import shared UI via `../components/...` not `./...`.
- Import page-scoped components via `./<domain>/...` within the same route directory.
- Shared components must never import from `src/pages/...`.
- Page components may import shared components, hooks, and services.

## Shared Component Criteria

- Encapsulates a focused UI concern; reusable across routes.
- Accepts generic props; does not depend on page-specific query state or route params.
- May perform intrinsic data fetching if central to the component’s function (e.g., `UserSecurityModal` using `userSecurityService`).
- Only imports from `src/components`, `src/hooks`, `src/services`, `src/types`, and utility modules.
- No navigation or route coupling (`useNavigate`, route params) unless explicitly designed as global UI.

## Page Component Criteria

- Orchestrates data fetching, optimistic updates, and mutations for the route.
- Computes permissions/access and passes them down to child components.
- Can compose shared components and page-scoped components.
- Keeps route-state management local (pagination, search, filters, UI state).

## Props & Types

- Shared component props are narrow and stable (`isOpen`, `onClose`, `onSubmit`, IDs, labels).
- Page components pass derived values: `permissions`, `accessLevel`, `currentUser`, etc.
- Page-only types live in `src/pages/<route>/types.ts`; shared types in `src/types`.

## Data Fetching & Mutations

- Page components own list/detail queries and optimistic updates; invalidate route-level query keys.
- Shared components that fetch must use isolated query keys and services relevant to their function.
- Avoid having shared components reach into page query state or invalidate page-level keys unless necessary.

## Permissions & Access

- Page computes and supplies permission booleans/lists to children (e.g., `canManageRoles`, `delete` list).
- Shared components render based on provided props; avoid reading `AuthContext` directly unless truly cross-cutting.

## UI Consistency

- Use the design system classes consistently across both layers.
- Skeletons/loaders that can be reused belong in `src/components/<domain>/...`.
- Keep action buttons and semantics consistent (e.g., `onClose`, `onSubmit`, `isPending`).

## Testing & Linting

- Hooks and services should have unit tests under `src/hooks/__tests__/` or similar.
- Ensure lints/type checks pass for any new components and props contracts.

## Anti-Patterns

- Shared component imports anything from `src/pages/...`.
- Shared component depends on route params, navigation, or page-local types.
- Page component exposes services or business logic as props when it should be encapsulated.
- Duplicate skeletons or UI patterns in pages that belong in `components`.
- Logging secrets or leaking environment configuration from components.

## Review Walkthrough

- Verify placement: is the component under `src/components/...` or `src/pages/<route>/...` appropriately?
- Scan imports:
    - Shared: only `../services`, `../hooks`, `../types`, `../components`.
    - Page: `../components/...` and `./<domain>/...` as needed.
- Check props contracts: shared components accept generic props; page components wire up complex state.
- Inspect data fetching:
    - Page orchestrates list/detail queries and optimistic updates.
    - Shared only fetches intrinsic data to its function and uses isolated keys.
- Validate permissions handling: page computes and passes; shared consumes.
- Confirm skeleton usage: reusable skeletons live in `components` and are imported by page tables.
- Ensure no route coupling in shared UI (navigation, params, page types).
- Run lints/type checks and existing tests to verify contracts are honored.

## Quick Examples

- Correct shared import: `src/pages/Users.tsx:6` imports `UserSecurityModal` from `../components/users/UserSecurityModal`.
- Correct page-scoped imports: `src/pages/Users.tsx:11–13` import `UserCreateModal`, `UserEditModal`, `UserTable` from `./users/...`.
- Shared component service usage: `src/components/users/UserSecurityModal.tsx:31–71` uses `userSecurityService` and isolated query/mutation keys.
