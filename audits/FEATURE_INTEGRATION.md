---
title: 'Feature Integration and Reachability Audit'
last_updated: '2026-02-03'
version: '1.0'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Per-feature and Quarterly'
lifecycle: 'development'
description: 'Detect features that are fully built but not wired into user-facing application paths'
---

# Feature Integration and Reachability Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

## Executive Summary

**🎯 Critical Integration Priorities**

- **End-to-End Reachability**: Every feature must be accessible from a user-facing path (UI navigation, CLI command, scheduled job)
- **Cross-Boundary Verification**: Every backend endpoint has a frontend caller; every frontend page has a route and navigation link
- **No Library Code**: Services, utilities, and abstractions must have an immediate consumer — not "for future use"

**📋 Essential Standards (Required)**

- **Tracer Bullet Development**: Wire the integration path first, then build the implementation
- **Feature Observability**: Every feature should be verifiable through access logs or route manifests
- **Consumer Contracts**: Before a feature ships, a concrete consumer must exist or be committed

**⚡ Detection Requirements**

- **Entrypoint Traversal**: Trace reachability from app entrypoints, not just import references
- **Route Manifest Completeness**: Frontend routes, backend routes, and navigation links must align
- **Schema-to-UI Path**: Every database table with writes must have a reachable read path

## Relationship to DEAD_CODE.md

This audit addresses a distinct problem from traditional dead code detection:

| Aspect                     | [DEAD_CODE.md](./DEAD_CODE.md)          | FEATURE_INTEGRATION.md                                                        |
| -------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| Core question              | "Is this file imported by anything?"    | "Is this feature reachable by a user?"                                        |
| Detection method           | Import reference analysis (grep)        | Entrypoint reachability traversal (graph)                                     |
| Typical finding            | Orphaned utility function, unused hook  | Complete feature island with tests and docs                                   |
| Why standard tools miss it | They don't — import analysis catches it | Feature components import _each other_, so import analysis sees them as alive |
| Prevention                 | Delete unused files                     | Wire integration before building internals                                    |
| False positive risk        | Dynamic imports, reflection             | Intentionally staged/experimental features                                    |

**Key insight**: A "Cathedral of Dead Code" passes DEAD_CODE.md's checks because all modules within the feature island reference each other. The code is internally coherent — it simply has no door connecting it to the rest of the application.

## Table of Contents

1. [Pre-Audit Setup](#pre-audit-setup)
2. [Scope](#scope)
3. [Methodology](#methodology)
4. [Detection Techniques](#detection-techniques)
5. [Code Review Red Flags](#code-review-red-flags)
6. [Prevention Strategies](#prevention-strategies)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)

## Pre-Audit Setup

### Required Information

```bash
# Frontend route inventory (React Router)
grep -rn "path=" frontend/src/App.tsx frontend/src/routes/

# Backend route inventory (Elysia)
grep -rn "\.use(" backend/src/app.ts

# Navigation link inventory
grep -rn "to=" frontend/src/components/ --include="*.tsx" | grep -i "nav\|sidebar\|menu"

# Frontend API module inventory
ls frontend/src/services/api/ 2>/dev/null || ls frontend/src/services/

# Database table inventory
grep -rn "export const.*sqliteTable\|export const.*pgTable" backend/src/db/schema/

# Orphan module detection (if available)
npx madge --orphans src/
```

### Baseline Data

Before auditing, collect:

- **Route manifest**: Complete list of frontend routes from `App.tsx` and backend routes from `app.ts`
- **Navigation map**: All sidebar/menu/nav links and where they point
- **API module list**: All frontend service modules that call backend endpoints
- **Schema inventory**: All database tables and their read/write consumers

## Scope

### What This Audit Covers

- Features that are internally coherent (imports resolve, tests pass) but unreachable from user-facing paths
- Backend endpoints registered in route files but not wired into `app.ts`
- Frontend pages that exist in `pages/` but have no route in `App.tsx`
- Frontend pages routed but not linked from any navigation component
- Services with complete implementations but no consumer outside their own feature directory
- Database tables/columns populated by seed scripts or migrations but never queried by reachable code

### What This Audit Does NOT Cover (handled by DEAD_CODE.md)

- Orphaned files with zero imports anywhere
- Unused utility functions or hooks with no internal consumers
- Dead exports within otherwise-used files
- Unreferenced type definitions

## Methodology

### 1. Entrypoint Enumeration

Identify all user-facing entrypoints:

- **Frontend**: `App.tsx` route definitions, navigation components (sidebar, menu, breadcrumbs), lazy-loaded route splits
- **Backend**: `app.ts` route registrations, cron/scheduled job registrations, WebSocket handler registrations
- **CLI**: Command registrations (if applicable)

### 2. Forward Reachability Analysis

From each entrypoint, trace the full import/call chain forward:

- Start at each registered route or navigation link
- Follow imports through pages → components → hooks → services → API modules
- Map which backend endpoints each frontend API module calls
- Map which database tables each backend service queries

Any file NOT reachable from any entrypoint is a candidate for investigation.

### 3. Cross-Boundary Verification

Verify that integration surfaces are complete across boundaries:

| From                    | To                  | Check                                              |
| ----------------------- | ------------------- | -------------------------------------------------- |
| Backend route file      | `app.ts`            | Is `.use(route)` present?                          |
| Backend endpoint        | Frontend API module | Does a service module call this endpoint?          |
| Frontend API module     | Mounted component   | Is the module imported by a routed page/component? |
| Frontend page           | `App.tsx`           | Does a `<Route>` entry exist?                      |
| Frontend route          | Navigation          | Is there a link in sidebar/menu/nav?               |
| Database table (writes) | Reachable service   | Is the writer called from a registered endpoint?   |
| Database table (reads)  | Reachable service   | Is the reader called from a registered endpoint?   |

### 4. Classification

- **Cathedral** 🚨 (Critical/High): Complete feature with service layer, routes, pages, possibly tests and documentation, but no integration into the live application. All internal references resolve; the island is self-consistent.
- **Partial Cathedral** ⚠️ (Medium): Some layers wired, others dangling. Examples: backend endpoint exists and is registered but no frontend page calls it; page exists and is routed but has no navigation link.
- **Dormant Feature** 📋 (Low): Intentionally built but not yet activated. **Must have explicit documentation** (ticket, comment, or feature flag) justifying the dormant state. Undocumented dormant features are reclassified as Cathedrals.

## Detection Techniques

### Static Archaeology

**Dependency Graph from Entrypoints**

Unlike import-based dead code detection (which looks for zero inbound edges), Cathedral detection requires _forward traversal from known entrypoints_:

```
App.tsx routes → Pages → Components → Hooks → API Services → Backend Endpoints → DB Queries
app.ts .use()  → Route files → Services → DB Queries
```

Modules reachable from these chains are alive. Modules that import each other but are NOT in any chain are Cathedral candidates.

**Route Definition Scraping**

Generate a complete list of registered routes from both layers:

- Frontend: Extract all `path=` values from `App.tsx` route configuration
- Backend: Extract all `.use()` registrations from `app.ts` and the prefix/path values within each route file
- Compare: Every backend path should have a corresponding frontend API call; every frontend route should render a reachable page

**Configuration Orphans**

Check for feature-related configuration that is never consumed:

- Config keys in `config/{app-slug}.json` with no corresponding `config.get()` call in reachable code
- Environment variables or feature settings defined but never read
- Database columns written to but never read (or vice versa) by reachable code

**The Integration Test Coverage Trap**

High unit test coverage combined with low integration/E2E test coverage is a prime breeding ground for Cathedrals. Unit tests validate that the island's internal logic works — they say nothing about whether the island is connected to the mainland.

✅ Good: Integration test navigates to the feature via the UI and exercises the full stack
❌ Bad: Unit tests for the service, unit tests for the component, but no test that connects them through an actual route

### Immediate Triage (for inherited codebases)

1. **Route scraping**: Dump all registered routes from both layers. Manually navigate to each one from the UI. If a route exists in code but cannot be reached via normal navigation, it is a Cathedral candidate.
2. **Log injection**: Temporarily add `console.warn('ALIVE: FeatureName')` to suspected orphan modules. Run the full test suite and simulate user workflows. If the warning never fires, the module is an island.
3. **Database query analysis**: Identify tables with write volume but zero read volume (or vice versa). A table that is populated but never displayed is a strong Cathedral signal.

## Code Review Red Flags

Watch for these patterns in PRs — they are the moments when Cathedrals are born:

### The "Library" PR

A PR that adds a new service, utility, or module but makes **no changes to entrypoint files** (`app.ts`, `App.tsx`, route config, navigation components). The description says "Added the `PaymentOrchestrator` service" but `checkout.tsx` is untouched.

✅ Good: PR adds `paymentService.ts` AND wires it into the checkout route AND adds a navigation path
❌ Bad: PR adds `paymentService.ts` with complete logic and tests but no consumer

### The "Extensible" Trap

Abstractions designed for hypothetical future use: "We'll wire this up when we build the admin panel." Unless the _next_ PR in the stack is already visible and committed, this abstraction is a Cathedral in the making.

✅ Good: Abstraction is introduced alongside its first consumer in the same PR
❌ Bad: "This provides a foundation for future features" — with no concrete consumer committed

### Missing Entrypoint Imports

In a new feature PR, check whether the feature's top-level module is imported in an entrypoint:

- New route file → is it `.use()`'d in `app.ts`?
- New page component → is it in `App.tsx` route config?
- New sidebar item → is it rendered in the navigation component?

If none of these imports exist, the feature is DOA regardless of code quality.

### Documentation-First Islands

The README or docs are updated with usage examples and feature descriptions, but no actual route, page, or navigation link references the feature. The documentation describes a capability that users cannot access.

✅ Good: Documentation links match actual UI navigation paths
❌ Bad: Docs describe "the reporting dashboard" but no route to `/reports` exists in App.tsx

## Prevention Strategies

### Tracer Bullet Development

The first commit for any feature should be a **steel thread** — the thinnest possible vertical slice touching all layers:

1. Register the route in `app.ts` (backend) and `App.tsx` (frontend)
2. Add a navigation link in the sidebar/menu
3. Create a stub page that calls a stub endpoint returning hardcoded data
4. Verify: a user can click through the UI and see the stub response

Only after this wiring is proven do you build out the real implementation. This inverts the typical approach (build the service first, wire it later) and eliminates the window where Cathedral formation occurs.

### Integration Verification Checklist (per feature)

Before a feature is considered complete:

- [ ] Backend route registered in `app.ts`
- [ ] Frontend route registered in `App.tsx`
- [ ] Navigation link added to sidebar/menu component
- [ ] Frontend API module calls the backend endpoint
- [ ] At least one integration test exercises the full path (UI → API → DB)
- [ ] Feature is accessible by navigating the application UI (not just direct URL)

### Feature Observability

Every feature should produce evidence of use:

- Access logs show requests to the feature's endpoints
- Route manifest diffs in CI detect when a route file exists without registration
- Automated checks compare `pages/` directory contents against `App.tsx` route entries

## Audit Checklist

### Critical Checks 🚨

- [ ] All backend route files in `routes/` are `.use()`'d in `app.ts`
- [ ] All frontend pages in `pages/` are registered in `App.tsx` route configuration
- [ ] All frontend API modules are called from at least one mounted, routed component
- [ ] No database tables exist without a reachable read and write path

### High Priority Checks ⚠️

- [ ] Navigation (sidebar/menu) covers all registered frontend routes
- [ ] No services exist without a consumer outside their own feature directory
- [ ] Cross-boundary verification complete: every backend endpoint has a frontend caller
- [ ] Every frontend API call targets a registered backend endpoint

### Medium Priority Checks 📋

- [ ] Integration tests cover the full user path for each feature
- [ ] Feature documentation references actual working routes and navigation paths
- [ ] Config keys and settings are consumed by reachable code
- [ ] No "library" services exist without documented, committed consumers

### Low Priority Checks 💡

- [ ] Automated route manifest diffing integrated into CI or smoke:qc
- [ ] Feature observability (logging/metrics) verified for all features
- [ ] Dormant features have explicit documentation justifying dormant state

## Report Template

Create report: `docs/audits/FEATURE_INTEGRATION_REPORT_YYYY-MM-DD.md`.

```markdown
# Feature Integration Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Integration Health**: [Strong/Moderate/Weak]
**Total Features Analyzed**: [Number]
**Cathedral Features Found**: [Number]
**Partial Cathedrals Found**: [Number]
**Documented Dormant Features**: [Number]

### Key Findings

- Major Cathedral features (complete but unreachable)
- Partial integration gaps (missing navigation links, unregistered routes)
- Backend endpoints without frontend callers
- Frontend pages without navigation paths

## Detailed Findings

### Cathedral Features (Critical/High)

| Feature | Layers Present              | Missing Integration                   | Location                        | Remediation                      |
| ------- | --------------------------- | ------------------------------------- | ------------------------------- | -------------------------------- |
| [Name]  | Service, Route, Page, Tests | Not registered in app.ts; no nav link | `backend/src/routes/feature.ts` | Register route; add sidebar link |

### Partial Cathedrals (Medium)

| Feature | What's Wired       | What's Missing     | Location                        | Remediation              |
| ------- | ------------------ | ------------------ | ------------------------------- | ------------------------ |
| [Name]  | Backend registered | No frontend caller | `backend/src/routes/feature.ts` | Create API module + page |

### Dormant Features (Low — requires justification)

| Feature | Justification | Ticket/Issue | Review Date |
| ------- | ------------- | ------------ | ----------- |
| [Name]  | [Why dormant] | [Link]       | [Date]      |

## Cross-Boundary Matrix

| Backend Route  | Registered in app.ts? | Frontend API Module? | Mounted Component? | Navigation Link? | Status     |
| -------------- | --------------------- | -------------------- | ------------------ | ---------------- | ---------- |
| `/api/feature` | ✅                    | ✅                   | ✅                 | ✅               | Integrated |
| `/api/orphan`  | ✅                    | ❌                   | ❌                 | ❌               | Cathedral  |

## Recommendations

### Immediate

1. Wire or remove Cathedral features — they add maintenance cost with zero user value
2. Add navigation links for routes missing them

### Short-term

1. Implement route manifest diffing in CI
2. Add integration verification step to feature completion checklist

### Long-term

1. Adopt tracer bullet development for all new features
2. Schedule quarterly integration audits as part of hygiene

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Usage Notes

This audit document is the source of truth for detecting and classifying feature integration gaps. It complements [DEAD_CODE.md](./DEAD_CODE.md) — use both together for comprehensive coverage.

- **DEAD_CODE.md**: Finds code with zero import references (orphaned files, unused exports)
- **FEATURE_INTEGRATION.md**: Finds code with import references that form self-contained islands unreachable from user paths

Prevention rules derived from this audit are enforced as architectural constraints in the project's `project.txt` specification. Workflow integration is documented in `DEVELOPMENT.md` (Creating New Endpoints, Creating New Pages, Task Completion sections).
