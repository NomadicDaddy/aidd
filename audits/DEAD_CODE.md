---
title: 'Dead Code and Orphaned Files Audit'
last_updated: '2025-12-02'
version: '1.0'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'development'
source: 'commands/undead.md'
---

# Dead Code and Orphaned Files Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

Use this audit to systematically identify unused, unreferenced, or unexposed code across frontend and backend.

## Audit Objectives

- Detect **orphaned files** with zero references
- Identify **unexposed components/pages/controllers** not wired into routes or parents
- Surface **dead code** (unused utilities, hooks, services, models)
- Provide a **categorized report** with confirmed vs potential dead code
- Avoid false positives by respecting tests, examples, configs, and migrations

## Scope

### Frontend

- All files under `frontend/src/` (components, pages, hooks, services, utilities, etc.)
- Routing and entrypoints (e.g. `App.tsx`, `main.tsx`, route definitions, lazy-loaded routes)

### Backend

- All files under `backend/src/` (controllers, services, models/entities, middleware, DTOs, config modules)
- Router/registration points (e.g. `app.ts`, `routes.ts`, controller decorators)
- Entry scripts (`index.ts`, `server.ts`, workers)

## Exclusions

- Test files: `*.test.*`, `*.spec.*`, `__tests__/**`, `test/**`
- Example/demo directories (e.g. `frontend/src/components/examples/**`, `backend/src/examples/**`)
- Configuration/infra files (`vite-env.d.ts`, `jest.config.ts`, `ormconfig.ts`, `.env`, migrations, seeds)

## Methodology

### 1. Inventory all files

- Generate a list of all candidate files in `frontend/src/` and `backend/src/` (excluding known examples/tests/configs)
- For each file, capture:
    - Path
    - Type (component/page/hook/service/model/controller/util/etc.)

### 2. Reference analysis

For each candidate file:

- **Frontend**:
    - Search for import references across `frontend/src/`
    - Check routing (static and lazy routes) for exposure
    - Check if the file is an entrypoint (e.g. `main.tsx`)
    - Treat type-only files as in-use if imported anywhere

- **Backend**:
    - Search for import references across `backend/src/`
    - Check router/registration for exposure (route wiring, decorators)
    - Check for entry scripts (server/worker)
    - Consider dynamic registration patterns (DI tokens, framework configs)

### 3. Classification

Classify each file into one of:

- **Confirmed unused files**
    - Zero references in code
    - No dynamic loading/registration patterns
    - Not a config/migration/test/example

- **Potentially unused files**
    - Ambiguous or indirect usage (e.g. reflection, string-based routing)
    - Looks like it should be used but no explicit import found

- **In-use files**
    - Clearly referenced, registered, or used

### 4. Verification & False Positive Control

- Re-check any file flagged as unused against:
    - Dynamic imports (`lazy(() => import(...))`)
    - String-based references (route names, job names)
    - Framework-specific registration (decorators, DI, ORM configs)
- If in doubt, categorize as **Potentially unused** instead of **Confirmed unused**.

## Audit Checklist

### Critical Checks 🚨

- [ ] All `frontend/src/` files reviewed (excluding configured exclusions)
- [ ] All `backend/src/` files reviewed (excluding configured exclusions)
- [ ] Confirmed unused files have **zero** references and no dynamic registration
- [ ] No test, config, migration, or example file is incorrectly flagged

### High Priority Checks ⚠️

- [ ] Unexposed routes/components identified and labeled
- [ ] Unused utilities/hooks/services/models documented
- [ ] Orphan controllers/route handlers identified
- [ ] Summary statistics computed (total files, unused count, dead-code %)

### Medium Priority Checks 📋

- [ ] Potentially unused files clearly marked for manual review
- [ ] Notes captured for dynamic patterns that complicate detection
- [ ] Candidate files for deletion vs. consolidation identified

### Low Priority Checks 💡

- [ ] Dead code detection integrated into CI pipeline
- [ ] Cleanup schedule established for confirmed dead code
- [ ] Documentation updated after file removal

## Report Template

Create report: `docs/audits/UNDEAD_AUDIT_REPORT_YYYY-MM-DD.md`.

```markdown
# Dead Code & Orphaned Files Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Dead Code Level**: [Low/Moderate/High]
**Total Files Analyzed**: [Number]
**Confirmed Unused Files**: [Number]
**Potentially Unused Files**: [Number]
**Estimated Dead Code Percentage**: [X]%

### Key Findings

- Major dead-code clusters by area (frontend/backend, feature folders)
- Highest-risk orphaned files (controllers, pages)
- Quick-win deletions vs. careful review items

## Detailed Findings

### Confirmed Unused Files

- `path/to/file1.ts` - [type]
- `path/to/file2.tsx` - [type]

### Potentially Unused Files (Manual Review Required)

- `path/to/ambiguousFile.ts` - suspected unused, but used via [dynamic pattern]

## Summary Statistics

- Total files analyzed: [Number]
- Confirmed unused: [Number]
- Potentially unused: [Number]
- Dead code percentage: [X]%

## Recommendations

### Immediate (0-7 days)

1. Remove clearly confirmed unused files (after one reviewer sanity check)
2. Open issues for high-importance orphan controllers/pages

### Short-term (1-4 weeks)

1. Refactor ambiguous dynamic patterns to more explicit imports where possible
2. Add tests to cover borderline files before removal

### Long-term (1-3 months)

1. Integrate automated dead-code checks (e.g., Knip, Madge) into CI
2. Schedule recurring undead audits as part of hygiene

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Usage Notes

This audit document is the source of truth for how to interpret results, classify files, and structure the final report.
