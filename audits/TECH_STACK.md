---
title: 'Technology Stack and Infrastructure Audit'
last_updated: '2026-06-28'
version: '1.3'
category: 'Architecture'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
source: 'commands/procedures/stack.md'
---

# Technology Stack and Infrastructure Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

This audit documents the **actual** tech stack (frontend, backend, infrastructure, tooling) in detail, validates configuration, and highlights consolidation opportunities and any upgrades warranted under the app's release policy.

> **LTS framing**: Spernakit is now an **LTS line** (`STACK.md` is v3.11.0-lts, 2026-06-27): runtime dependencies are pinned to **exact** versions and updates are scoped to security advisories. For LTS apps, treat exact-pinned runtime deps as **expected, not a finding**, and file any upgrade recommendations against the **next-line backlog**, not main. Reserve in-line upgrade calls for security-advisory or EOL situations.

## Table of Contents

- [Audit Objectives](#audit-objectives)
- [Scope](#scope)
- [Audit Boundary (TECH_STACK vs DEVOPS)](#audit-boundary-tech_stack-vs-devops)
- [Pre-audit Setup](#pre-audit-setup)
- [Methodology](#methodology)
- [Audit Checklist](#audit-checklist)
- [Report Template](#report-template)
- [Spernakit Validation Commands](#spernakit-validation-commands)
- [Deliverables](#deliverables)
- [Usage Notes](#usage-notes)

## Audit Objectives

- Produce a **single, authoritative description** of the full stack
- Verify **versions, configuration, and compatibility**
- Map **infrastructure and hosting** (frontend, backend, databases, CDNs)
- Identify **deprecated, duplicated, or risky** technologies
- Recommend **simplifications** with clear impact, and **upgrades** where the release policy warrants them (see [LTS framing](#technology-stack-and-infrastructure-audit-framework) - for LTS apps, route upgrades to the next-line backlog unless they address a security advisory or EOL)

## Scope

- Application-level dependencies (`package.json`, lockfiles)
- Build tooling (Vite - the stack is Vite-only; there is no Next or Webpack layer)
- Styling systems (Tailwind, CSS modules, design systems)
- Backend runtimes, frameworks, databases, ORMs
- Deployment platforms, CDNs, DNS, SSL
- CI/CD, monitoring, logging, analytics, and supporting tools

## Audit Boundary (TECH_STACK vs DEVOPS)

TECH_STACK inventories **what** tooling exists and its versions/compatibility. DEVOPS owns **whether** CI and quality gates actually run that tooling. When a finding concerns a missing or misconfigured pipeline/quality gate (e.g. a missing `check-deps` script in CI, a broken `smoke:qc` job), record it under **DEVOPS** and cross-reference it here rather than reporting it as a stack-inventory defect.

## Pre-audit Setup

Before inventorying, run the project's built-in validation tooling to establish a baseline and surface drift (see [Spernakit Validation Commands](#spernakit-validation-commands)). For Spernakit-based apps these are `config:validate`, `check:drift`, `check-deps`, and the full `smoke:qc` gate.

## Methodology

### 1. Configuration and Dependency Analysis

- Inspect:
    - `package.json` and lockfiles for dependency inventory
    - Build configs: `vite.config.*`, `tsconfig.json`, `bunfig.toml`, CSS-first `@theme` files (Tailwind v4)
    - Deployment/config files (e.g. `docker-compose.yml`, `Dockerfile`, `config/*.json`)
    - Spernakit-specific: `config/{slug}.json`, `bunfig.toml` (must have `env = false`)
- For each major dependency or tool, capture:
    - Name and version
    - Category (framework, runtime, styling, testing, infra, etc.)
    - Primary responsibility in the system

### 2. Stack Documentation Structure

Target output: `docs/stack.md` (or project-specific location) with sections:

- **Frontend Stack**
    - Framework, build tool, language, package manager
    - CSS framework, UI components, state management
    - Performance/UX tooling (bundle/asset optimizers; note: the stack has no PWA or service-worker layer - do not flag its absence)
- **Backend & Database**
    - Backend framework/platform, APIs, real-time mechanisms
    - Database/ORM choices, caching layers, queues
    - **Dual-dialect**: the DB dialect is config-selected (`config.database.dialect` - `sqlite` or `postgres`, via the `pg` driver) with a parallel `schema-pg/` tree. Both schema trees must stay in parity; `check:schema-parity` is the guard.
- **Hosting & Deployment**
    - Hosting providers, CDNs, domains, SSL, environment config
- **Development & Testing**
    - Testing frameworks, QA tooling, code quality gates
    - Local dev tooling and workflows
    - **Canonical Spernakit testing approach**: end-to-end via `crawltest` plus the `smoke:qc` quality gate. Spernakit deliberately uses **no unit-test frameworks** (no vitest, jest, or @testing-library). The absence of a unit-test framework is by design and is **not** a finding. (App-level exception: aidd additionally uses `bun test` for some CLI units - note such exceptions, do not flag them.)
- **Production Configuration**
    - Build targets, optimization techniques, monitoring, caching, offline behavior

### 3. Version and Compatibility Validation

For each major component:

- Confirm **current version** and note EOL or deprecation status
- Check **compatibility** across the dependency matrix (e.g. React + React Compiler, Tailwind v4 + Vite toolchain, Bun + Elysia/Drizzle requirements). Note: in Spernakit the **React Compiler is standard, not experimental** - `babel-plugin-react-compiler` is pinned and enabled by default (automatic memoization; no manual `React.memo`). Treat it as a baseline part of the stack, not an opt-in compatibility risk.
- Identify **mixed or duplicated** tech (multiple CSS systems, multiple HTTP clients, etc.)

### 4. Risk and Debt Assessment

Classify findings:

- **Critical**: Unsupported/EOL versions, unmaintained core dependencies, insecure defaults
- **High**: Multiple overlapping technologies; unpinned versions in **runtime/production** dependencies or a missing/deleted committed lockfile. (Scope: flag pinning gaps in runtime dependencies and the lockfile only. Caret/tilde ranges in **dev-only tooling** are acceptable and should not be flagged; a present, committed `bun.lock` satisfies build determinism.)
- **Medium**: Outdated but still supported versions, inconsistent configuration
- **Low**: Minor inconsistencies, cosmetic differences

## Audit Checklist

### Critical Checks 🚨

- [ ] All major frameworks/runtimes have supported, non-EOL versions
- [ ] No critical dependency is unmaintained or abandoned
- [ ] Build and deployment tooling is compatible with current Bun/Runtime versions (defer to STACK.md prerequisites for the canonical floor)
- [ ] Config is JSON-only (`config/{slug}.json`); `bunfig.toml` has `env = false`; no `.env`/dotenv for general config (environment variables limited to the approved `SECRET_CONFIG_KEYS` secret injection)
- [ ] Production hosting and SSL configuration documented and current

### High Priority Checks

- [ ] Duplicated frameworks or styling systems identified
- [ ] Multiple data-access layers or ORMs rationalized
- [ ] Monitoring, logging, and analytics tools documented
- [ ] Test tooling and coverage tooling documented

### Medium Priority Checks 📋

- [ ] Developer tooling and DX enhancements documented
- [ ] Optional or experimental tools clearly labeled
- [ ] Upgrade recommendations prioritized with effort/impact

### Low Priority Checks 💡

- [ ] Documentation matches actual stack configuration
- [ ] Stack decisions and trade-offs documented
- [ ] Future roadmap considerations noted

## Report Template

Use or extend `docs/stack.md` (or project-specific location) and summarize here:

```markdown
# Technology Stack Audit Report - YYYY-MM-DD

## Executive Summary

- Primary frontend stack: [framework] [version]
- Primary backend stack: [runtime/framework] [version]
- Database & storage: [systems]
- CI/CD & hosting: [platforms]

### Key Findings

- Critical stack risks
- Major upgrade opportunities
- Simplification opportunities

## Detailed Stack Inventory

### Frontend Stack

- **Framework**: [Name Version] - [Purpose]
- **Build Tool**: [Name Version]
- **Language**: [TypeScript/JS version]
- **Styling/UI**: [Tailwind/Design system/etc.]
- **State Management**: [Libraries]

### Backend & Database

- **Backend**: [Platform/Framework]
- **Database/ORM**: [Systems]
- **Real-time**: [Mechanisms]

### Hosting & Deployment

- **Frontend Hosting**: [Provider]
- **Backend Hosting**: [Provider]
- **CDN**: [Provider]
- **SSL & Domains**: [Summary]

### Tooling & Quality

- **Testing**: [Frameworks]
- **Code Quality**: [Linters, formatters]
- **Monitoring & Analytics**: [Tools]

## Recommendations

### Immediate (0-7 days)

1. Address any EOL/unsupported core dependencies
2. Document missing stack components

### Short-term (1-4 weeks)

1. Reduce duplicated technologies
2. For LTS apps, file any non-security upgrade recommendations against the next-line backlog (security-advisory/EOL upgrades may be planned directly)

### Long-term (1-3 months)

1. Align stack with reference architectures
2. Periodically re-run stack audit and update docs

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Spernakit Validation Commands

For Spernakit-based applications, the following built-in validation tools supplement manual stack inspection:

```bash
# Validate config against Zod schema + security checks
# (config uses Zod; route/API schemas use TypeBox — do not conflate)
bun run config:validate

# Check for template drift (derived apps only)
bun run check:drift

# Verify dependency version consistency
bun run check-deps

# Verify the committed lockfile is frozen/in-sync (bun.lock determinism guard)
bun run check:lockfile-frozen

# Full quality gate (includes typecheck, lint, build, format, api-types, deps)
bun run smoke:qc
```

## Deliverables

A successful run of this audit produces:

- An authoritative, up-to-date `docs/stack.md` (or project-specific location) describing the full stack
- Risk-classified findings (Critical / High / Medium / Low) per the [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) tiers
- A prioritized upgrade/consolidation plan with effort and impact for each item

## Usage Notes

Use this audit to **evaluate** the documented stack, score risk, and plan upgrades or simplifications.
