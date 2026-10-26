---
title: 'Technology Stack and Infrastructure Audit'
last_updated: '2026-10-25'
version: '1.5'
category: 'Architecture'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Technology Stack and Infrastructure Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.
> **Citations**: this file names files and symbols, not line numbers. Cite the live file:line you read in the report.

This audit documents the **actual** tech stack (frontend, backend, infrastructure, tooling) in detail, validates configuration, and highlights consolidation opportunities and any upgrades warranted under the app's release policy.

> **Version and release policy**: read both from the target at audit time, never from this file. See [Release Policy](#release-policy-read-it-from-the-target).

## Table of Contents

- [Release Policy: Read It From the Target](#release-policy-read-it-from-the-target)
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

## Release Policy: Read It From the Target

Do not take a version number or a release policy from this file. Both go stale faster than the audit is reviewed. Read them from the target at audit time:

- **Version**: the `version` field of the target's root `package.json`. A Spernakit-derived app has its own version there, and records the template release it was last synced to in the `spernakit_version` field of the same file. That field, not the template's current version, says which template the app is on.
- **How the stack describes itself**: the target's stack document. For the Spernakit template that is `docs/template/STACK.md`, whose opening lines state the dependency policy and the runtime floor. For any other target, find its stack document before assuming one.
- **What the tooling enforces**: `check-deps`, read from the target, because the script of that name differs by repository. In Spernakit and derived apps it rejects any dependency spec that is not an exact version or `workspace:*`. In aidd it checks that workspaces agree on each shared dependency and that the lockfile parses; it does not require exact pins.

What that reading means for findings:

- **Spernakit and derived apps**: exact-pinned dependencies are the policy, so they are **expected, not a finding**. A range specifier is the finding. A dependency change must update the lockfile in the same change and pass `check-deps` and the full gate.
- **aidd**: its manifests are respected as they stand. A range specifier there, backed by the committed `bun.lock`, is recorded in the inventory and is not a finding; do not recommend normalizing it.
- **No release line is assumed.** The template does not describe itself as a long-term-support line, and there is no separate backlog to route upgrades to. If a target's own stack document declares a restricted update policy, quote it and follow it; otherwise recommend upgrades on their merits with effort and impact.
- **Deliberate holds are not staleness.** Before reporting a tool as outdated, check the workspace-root `AGENTS.md` and the target's stack document for a recorded hold. The standing one: `typescript` is pinned to 6.0.3, the last 6.x release, because typescript-eslint does not yet support TypeScript 7 and lint crashes under it. Do not recommend the move to 7, and do not recommend downgrading typescript-eslint to make 7 work. Report the hold as a hold, with the condition that lifts it.
- **Never recommend a downgrade as a fix.** A version conflict is reported with its cause; rolling a package back needs the owner's explicit decision.

## Audit Objectives

- Produce a **single, authoritative description** of the full stack
- Verify **versions, configuration, and compatibility**
- Map **infrastructure and hosting** (frontend, backend, databases, CDNs)
- Identify **deprecated, duplicated, or risky** technologies
- Recommend **simplifications** with clear impact, and **upgrades** where the target's own release policy warrants them (see [Release Policy](#release-policy-read-it-from-the-target) - recorded holds are reported as holds, not as upgrade opportunities)

## Scope

- Application-level dependencies (`package.json`, lockfiles)
- Build tooling. Spernakit, derived apps and aidd build with Vite only; there is no Next or Webpack layer, so do not flag its absence. For any other target (a CLI, a static site, a mobile app) record the build tooling that is actually there
- Styling systems (Tailwind, CSS modules, design systems)
- Backend runtimes, frameworks, databases, ORMs
- Deployment platforms, CDNs, DNS, SSL
- CI/CD, monitoring, logging, analytics, and supporting tools

## Audit Boundary (TECH_STACK vs DEVOPS)

TECH_STACK inventories **what** tooling exists and its versions/compatibility. DEVOPS owns **whether** CI and quality gates actually run that tooling. When a finding concerns a missing or misconfigured pipeline/quality gate (e.g. a missing `check-deps` script in CI, a broken `smoke:qc` job), record it under **DEVOPS** and cross-reference it here rather than reporting it as a stack-inventory defect.

## Pre-audit Setup

Inventory actual manifests, lockfiles and tooling source first. Reuse matching retained validation
evidence. Commands in [Spernakit Validation Commands](#spernakit-validation-commands) are target
examples, not a mandatory baseline sequence. Inspect their transitive effects and acquire only
the smallest authorized isolated check needed for an unresolved claim. Do not guess missing
script names, install/update dependencies, repair drift or repeat the full gate for this audit.

A step that the gate reports as `[CACHED]` did not run: it replays an earlier pass recorded against the same declared inputs. Record it as cached. It is baseline context for this audit, never the evidence for a stack claim, and it is not to be forced or cleared to get a fresh line.

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

Target output: the audit report's stack inventory and proposed corrections to the project's
existing stack document. Find that document first: the Spernakit template keeps
`docs/template/STACK.md`, and other targets vary. Do not edit it during the audit. Where a project
has no stack document, put the inventory in the report and assess whether the missing
documentation creates a concrete gap. Do not create a second document beside an existing one.
The inventory has these sections:

- **Frontend Stack**
    - Framework, build tool, language, package manager
    - CSS framework, UI components, state management
    - Performance/UX tooling (bundle/asset optimizers; note: the stack has no PWA or service-worker layer - do not flag its absence)
- **Backend & Database**
    - Backend framework/platform, APIs, real-time mechanisms
    - Database/ORM choices, caching layers, queues
    - **Dual-dialect (Spernakit and derived apps)**: the DB dialect is config-selected (`config.database.dialect` - `sqlite` or `postgres`, via the `pg` driver) with a parallel `schema-pg/` tree. Both schema trees must stay in parity; `check:schema-parity` is the guard. A single-dialect target has no `schema-pg/` tree and that is not a finding. The script name is reused with a different meaning elsewhere: in aidd, `check:schema-parity` compares the migrations against the Drizzle schema of its one SQLite database.
- **Hosting & Deployment**
    - Hosting providers, CDNs, domains, SSL, environment config
- **Development & Testing**
    - Testing frameworks, QA tooling, code quality gates
    - Local dev tooling and workflows
    - **Canonical Spernakit testing approach**: end-to-end via `crawltest` plus the `smoke:qc` quality gate. Spernakit deliberately uses **no unit-test frameworks** (no vitest, jest, or @testing-library). The absence of a unit-test framework is by design and is **not** a finding. (This describes Spernakit and derived apps only. aidd is not derived from the template and runs a `bun:test` unit suite with coverage thresholds as a step of its own gate and in CI; that is an intentional difference, so record it and do not flag it. For other targets, record the test tooling that is there.)
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
- **High**: Multiple overlapping technologies; unpinned versions in **runtime/production** dependencies or a missing/deleted committed lockfile. (Scope: flag pinning gaps in runtime dependencies and the lockfile only. Caret/tilde ranges in **dev-only tooling** are acceptable and should not be flagged; a present, committed `bun.lock` satisfies build determinism. Two targets differ, per [Release Policy](#release-policy-read-it-from-the-target): in Spernakit and derived apps every spec, dev tooling included, must be exact, because `check-deps` enforces it; in aidd a range in a runtime manifest is recorded and not flagged.)
- **Medium**: Outdated but still supported versions, inconsistent configuration
- **Low**: Minor inconsistencies, cosmetic differences

## Audit Checklist

### Critical Checks 🚨

- [ ] All major frameworks/runtimes have supported, non-EOL versions
- [ ] No critical dependency is unmaintained or abandoned
- [ ] Build and deployment tooling is compatible with current Bun/Runtime versions (defer to STACK.md prerequisites for the canonical floor)
- [ ] Spernakit and derived apps: config is JSON-only (`config/{slug}.json`); `bunfig.toml` has `env = false`; no `.env`/dotenv for general config (environment variables limited to the approved `SECRET_CONFIG_KEYS` secret injection, defined in `backend/src/config/configSecrets.ts`). Other targets: record how configuration is loaded and where secrets come from
- [ ] Production hosting and SSL configuration documented and current

### High Priority Checks

- [ ] Duplicated frameworks or styling systems identified
- [ ] Multiple data-access layers or ORMs rationalized
- [ ] Monitoring, logging, and analytics tools documented
- [ ] Test tooling and coverage tooling documented

### Medium Priority Checks 📋

- [ ] Developer tooling and DX enhancements documented
- [ ] Optional or experimental tools clearly labeled
- [ ] Upgrade recommendations prioritized with effort/impact; recorded holds (TypeScript 6.0.3) reported as holds, and no downgrade recommended

### Low Priority Checks 💡

- [ ] Documentation matches actual stack configuration, including every version the stack document quotes against the live manifests
- [ ] Stack decisions and trade-offs documented
- [ ] Future roadmap considerations noted

## Report Template

Compare the project's stack document with this inventory and report proposed corrections here:

```markdown
# Technology Stack Audit Report - YYYY-MM-DD

## Executive Summary

- Target and version: [name] [version from package.json] [template release, for a derived app]
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
2. Plan upgrades the target's release policy allows; list recorded holds separately with the condition that lifts each

### Long-term (1-3 months)

1. Align stack with reference architectures
2. Periodically re-run stack audit and update docs

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Spernakit Validation Commands

For Spernakit-based applications, the following built-in validation tools supplement manual stack inspection. Confirm each script exists in the target's `package.json` before running it:

```bash
# Validate defaults, the example config and the live config against the TypeBox config schema,
# plus security checks on the live config. Config and route/API schemas both use TypeBox;
# the template has no Zod dependency of its own.
bun run config:validate

# Check for template drift (derived apps only)
bun run check:drift

# Spernakit and derived apps: every dependency spec is an exact version or workspace:*
# aidd: workspaces agree on shared dependency versions and bun.lock parses
bun run check-deps

# Full quality gate (includes typecheck, lint, build, format, api-types, deps).
# Allow more than ten minutes; a timeout or a still-running gate is not a pass.
bun run smoke:qc
```

There is no lockfile-determinism script. Lockfile determinism is enforced where CI installs: both Canon repositories run `bun install --frozen-lockfile` in `.github/workflows/ci.yml`. Read the workflow to confirm it; do not run an install as part of this audit, because a non-frozen install can rewrite `bun.lock`.

## Deliverables

A successful run of this audit produces:

- An evidence-backed stack inventory in the audit report, with proposed corrections to the existing stack document
- Risk-classified findings (Critical / High / Medium / Low) per the [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) tiers
- A prioritized upgrade/consolidation plan with effort and impact for each item

## Usage Notes

Use this audit to **evaluate** the documented stack, score risk, and plan upgrades or simplifications.
