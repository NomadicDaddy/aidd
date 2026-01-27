---
title: 'Undead Code Audit'
last_updated: '2026-01-26'
version: '1.0'
category: 'Code Quality'
priority: 'High'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
---

# Undead Code Audit

Perform a comprehensive dead-code analysis of the codebase to identify unused, unreferenced, or unexposed files.

## Frontend

### Scope

- Analyze all files under `frontend/src/`
- Focus on components, pages, hooks, services, utilities, and any other TypeScript/JavaScript modules

### Analysis Requirements

1. For each file in `frontend/src/` (excluding the known examples above), determine:
    - Is it imported/referenced by any other file in the frontend?
    - Is it exposed through routing (e.g., in `App.tsx`, route definitions, or lazy-loaded routes)?
    - Is it used as an entry point (e.g., `main.tsx`)?
    - Is it a type definition file that's imported elsewhere?

2. Identify files that are:
    - **Orphaned**: Not imported or referenced anywhere
    - **Unexposed**: Components/pages that exist but are not wired into the UI through routing or parent components
    - **Dead code**: Utilities, hooks, or services that are defined but never consumed

3. For each potentially unused file found, verify by:
    - Searching for import statements referencing that file across the entire `frontend/src/` tree
    - Checking for dynamic imports (e.g., `lazy(() => import(...))`)
    - Checking for string-based references (e.g., route paths that might correspond to file names)

### Output Format

Provide a categorized list of findings:

- **Confirmed unused files**: Files with zero references
- **Potentially unused files**: Files with ambiguous or indirect usage that should be manually reviewed
- **Summary statistics**: Total files analyzed, total unused, percentage of dead code

### Exclusions

- Do NOT flag test files (`*.test.tsx`, `*.spec.tsx`, files in `__tests__` directories) as unused
- Do NOT flag known example files (`frontend/src/components/examples/*`)
- Do NOT flag configuration files (e.g., `vite-env.d.ts`)

## Backend

### Scope

- Analyze all files under `backend/src/`
- Focus on controllers, services, models/entities, middleware, utilities, DTOs, and configuration modules.

### Analysis Requirements

1.  For each file in `backend/src/` (excluding the known examples above), determine:
    - Is it imported/referenced by any other file in the backend?
    - Is it exposed through the API router (e.g., attached in `app.ts`, `routes.ts`, or controller decorators)?
    - Is it used as an entry point (e.g., `index.ts`, `server.ts`, or a worker script)?
    - Is it a database entity or model that might be loaded dynamically via framework configuration (e.g., ORM connection settings)?

2.  Identify files that are:
    - **Orphaned**: Not imported or referenced anywhere.
    - **Unexposed**: Controllers or Route handlers that exist but are not registered to the application instance or router.
    - **Dead code**: Services, middleware, helpers, or repository methods that are defined but never injected or consumed.

3.  For each potentially unused file found, verify by:
    - Searching for import statements referencing that file across the entire `backend/src/` tree.
    - Checking for Dependency Injection tokens or decorator usage (e.g., `@Inject`, `@Controller`) that might reference the class/file implicitly.
    - Checking for dynamic require/imports.

### Output Format

Provide a categorized list of findings:

- **Confirmed unused files**: Files with zero references and no framework-specific registration.
- **Potentially unused files**: Files with ambiguous usage (e.g., definitions that look like they should be used but aren't explicitly imported) that should be manually reviewed.
- **Summary statistics**: Total files analyzed, total unused, percentage of dead code.

### Exclusions

- Do NOT flag test files (`*.test.ts`, `*.spec.ts`, files in `__tests__` or `test` directories) as unused.
- Do NOT flag database migrations or seed files (often run via CLI and not imported by the app).
- Do NOT flag configuration files (e.g., `ormconfig.ts`, `.env`, `jest.config.ts`).
- Do NOT flag known example files (`backend/src/examples/*`).

## Report

Store the report in `docs/audits/UNDEAD_AUDIT_REPORT_YYYY-MM-DD.md`.
