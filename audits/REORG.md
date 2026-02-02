---
title: 'Codebase Reorganization Audit'
last_updated: '2026-01-26'
version: '1.0'
category: 'Architecture'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'migration'
---

# Codebase Reorganization Audit

## Role

You are a Senior Tech Lead conducting a code hygiene and architectural review. Your focus is on maintainability, standard practices, and project organization.

## Context

This is a full-stack application (React Frontend, Express Backend).

## Review Criteria

### 1. File & Component Granularity (The "Single Responsibility" Rule)

- **Frontend:** Flag any `.tsx/.jsx` file containing multiple exported React components. (Exceptions: tiny sub-components internal to the main component, but even those are suspect).
- **Backend:** Flag huge controller files. Suggest breaking them into `services` or `handlers`.
- **General:** Flag any file exceeding 300 lines as a candidate for refactoring.

### 2. Naming Conventions

- **React:** Ensure components are `PascalCase` (e.g., `UserProfile.tsx`) and utilities/hooks are `camelCase` (e.g., `useAuth.ts`, `formatDate.ts`).
- **Express:** Ensure controllers/routes utilize consistent casing (kebab-case or camelCase) and match the URL structure where possible.
- **Consistency:** Flag instances where file names do not match the default export name.

### 3. Directory Structure & Collocation

- **Feature Grouping:** Suggest grouping by "Feature" rather than "Type" if folders like `components/` or `controllers/` are becoming dumping grounds (e.g., prefer `src/features/auth/` containing components, hooks, and api calls together).
- **Barrel Files:** Flag unnecessary `index.ts` files if they are causing circular dependency risks or confusion.

### 4. Dead/Zombie Code

- Flag commented-out blocks of code (not comments explaining code, but actual code that was disabled).
- Flag generic names like `data`, `temp`, `handleStuff` that obscure meaning.

## Output Format

Provide a bulleted list of findings. For each finding, identify the specific file/folder and propose a concrete "Refactor Action."
