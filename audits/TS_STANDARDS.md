---
title: 'TypeScript Repo Standards Audit'
last_updated: '2026-08-30'
version: '1.2'
category: 'Core Quality'
priority: 'High'
estimated_time: '30-60 min'
frequency: 'Quarterly'
lifecycle: 'development'
description: 'Fleet-wide TypeScript toolchain conformance: tsconfig strictness, ESLint shape, Prettier identity, tool versions, and quality-gate script contract'
---

# TypeScript Repo Standards Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Verify that the target repository conforms to the workspace TypeScript toolchain standard. The standard itself is codified in the workspace-root `AGENTS.md` ("TypeScript Repo Standards"); spernakit is the living baseline.

## Executive Summary

This is a tiered, fleet-wide conformance audit. Read the live spernakit and aidd manifests and
configuration before scoring: the versions below are a reviewed reference, but the live Canon
repositories decide whether a difference is current drift or an approved exception. Canon repos
must align on strictness; derived apps inherit the template exactly; independent TypeScript repos
conform as far as their stack permits without hiding failures surfaced by stricter configuration.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [Applicability](#applicability)
4. [Checks](#checks)
5. [Intentional Differences Registry](#intentional-differences-registry-not-findings)
6. [Remediation Workflow](#remediation-workflow)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)
9. [Deliverables](#deliverables)

## Pre-Audit Setup

1. Read the workspace-root `AGENTS.md` TypeScript standards and the target's local instructions.
2. Read spernakit's live `package.json`, `.prettierrc`, `.editorconfig`, `eslint.config.js`, and
   tsconfigs; read the corresponding aidd files for a Canon target.
3. Identify every tracked `package.json`, tsconfig, and tooling config with `rg --files`.
4. Capture the target's package manager and installed versions from its manifest and lockfile.
5. Record the target tier before running any checks.

## Applicability

This audit **self-scopes**: if the target has no `tsconfig.json` anywhere (excluding `node_modules/`), report N/A and stop. Audit-profile mapping has no language facet, so this check is the language gate.

| Tier      | Targets                                                                                                     | Bar                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Canon   | spernakit, aidd                                                                                             | Full conformance. Any strictness divergence between the two is a finding unless listed in the Intentional Differences registry.                             |
| B Derived | spernakit-derived apps — any repo whose `.aidd/features/*/feature.json` carries a `spernakit_version` field | Tooling configs byte-identical to spernakit; exact dependency pins. Project-specific `knip.json` entries are acceptable and are not findings.               |
| C Conform | all other active TypeScript repos                                                                           | Conform as practical. Missing pieces are findings; surfaced-but-unfixed code errors behind a newly aligned config are **known-deferred**, not new findings. |

The concrete tier assignments live in the workspace-root `AGENTS.md` ("TypeScript Repo Standards"), which is the private index — do not enumerate app names in this file.

Dormant repos (no commits in >12 months) and `*.old` archives are out of scope.

## Checks

### 1. Tool versions

Compare the target's devDependencies against the baseline recorded in this audit:

| Tool                         | Baseline |
| ---------------------------- | -------- |
| typescript                   | 6.0.3    |
| eslint                       | 10.10.0  |
| typescript-eslint            | 8.69.0   |
| prettier                     | 3.9.6    |
| bun (engines/packageManager) | 1.4.2    |

```bash
rg '"(typescript|eslint|typescript-eslint|prettier)"' -g 'package.json'
rg '"(packageManager|bun)"' -g 'package.json'
```

Tier B additionally requires **exact** pins (no `^`/`~`) for all dependencies.

### 2. tsconfig strictness matrix

The strictness matrix below is canonical. Every workspace tsconfig
(backend/frontend/shared/scripts or root) must set:

`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUncheckedSideEffectImports`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `esModuleInterop`, `allowSyntheticDefaultImports`, `resolveJsonModule`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: bundler`, `target: ES2022`, `noEmit: true` (bun-runtime repos); frontend `lib` includes `ES2023`.

Use `git ls-files '*tsconfig*.json'` to enumerate the files, then inspect each one directly. Do not
infer repository-wide strictness from a single root tsconfig.

Vite-node helper configs (e.g. `tsconfig.node.json` covering only `vite.config.ts`) may relax; note but do not score.

### 3. ESLint shape

- Flat config via `tseslint.config()` in `eslint.config.js`
- Root files glob covers `**/*.{ts,tsx,js,jsx}` with a `**/*.js` relaxation block for plain JS
- `@typescript-eslint/no-explicit-any: 'error'`
- `eqeqeq: ['error', 'always']` — **no** `{ null: 'ignore' }` exemption
- `@typescript-eslint/unbound-method` NOT disabled in type-checked (frontend) configs
- perfectionist sorting, unused-imports, and the inline no-default-export plugin present
- `lint` script runs with `--max-warnings 0`; no hand-maintained file lists — directories/globs only

### 4. Prettier identity

```bash
diff <path-to>/spernakit/.prettierrc .prettierrc && diff <path-to>/spernakit/.editorconfig .editorconfig
```

Tier A: all sixteen formatting keys must match. The repo-local `tailwindStylesheet` path is an
intentional Canon difference because the two Canon repos have different Tailwind entry files.
Tier B: `.prettierrc` and `.editorconfig` must be byte-identical to spernakit. Tier C: key values
(`useTabs`, `tabWidth: 4`, `printWidth`, `singleQuote`, `semi`, and `trailingComma`) must match;
the plugin set may vary with the stack.

### 5. Script contract

`package.json` must expose: `typecheck`, `lint`, `format:check`, and `smoke:qc` (or a documented qc equivalent), plus `"preinstall": "bun scripts/require-bun.ts"` pointing at the no-dep guard (a bare `only-allow bun` is a finding: it needs a devDependency and bunx-downloads itself inside preinstall). Each must **execute** (a failing gate in Tier C is recorded, not hidden).

In workspace repos, run each workspace's gate **individually** — root scripts chain workspaces with `&&`, so the chain stops at the first failure and masks every workspace behind it. Record a per-workspace exit code and measured error/warning count. Never report a workspace clean without its actual measured count.

## Intentional Differences registry (not findings)

- aidd: caret ranges for prettier; bun:test in CI; `cli/` workspace; eslint/prettier `--cache`; incremental frontend build (vs composite+references); cached `smoke:qc:fast` pre-commit
- spernakit: no unit-test framework (crawltest by design); knip dead-code gate
- Canon CI: both aidd and spernakit read the Bun version from `package.json` via
  `bun-version-file`; a hardcoded workflow pin that drifts from the manifest is a finding
- Independent-by-design apps: a repo that follows spernakit conventions but self-declares as independent (registered `[react+vite]` rather than `[spernakit]` in its `.aidd/project.md`) audits as Tier C, not Tier B — the workspace-root AGENTS.md registry names them
- Tier B `knip.json`: project-specific `ignore`/`ignoreBinaries` entries

## Remediation workflow

1. Cite the exact config file and key for each finding (file:line).
2. Config fixes land per-repo, one commit per repo; Tier B fixes must keep configs byte-identical to spernakit (fix in spernakit first if the baseline itself is wrong).
3. Code errors surfaced by config alignment are fixed file-by-file — never bulk-scripted (workspace-root AGENTS.md, Code Quality Standards).
4. A Tier A divergence requires either (a) alignment, or (b) the user's explicit approval plus an entry in the Intentional Differences registry in both this file and workspace-root AGENTS.md.

## Audit Checklist

- [ ] Tier determined and stated (or N/A: no TypeScript)
- [ ] Tool versions compared against live spernakit values
- [ ] Every tsconfig in the repo checked against the strictness matrix
- [ ] ESLint shape checks 1-7 walked with the actual config open
- [ ] Prettier/editorconfig diffed, not eyeballed
- [ ] Script contract executed per workspace (not just the root chain), exit codes and measured counts recorded
- [ ] Findings exclude everything in the Intentional Differences registry

## Report Template

```markdown
# TypeScript Repo Standards Audit Report - YYYY-MM-DD

## Executive Summary

- Target and tier: [repo / Canon, Derived, or Conform]
- Overall result: [Pass / Findings / N/A]
- Live Canon baseline inspected: [file:line evidence]

## Findings

| Severity | Area                                   | Evidence    | Required alignment |
| -------- | -------------------------------------- | ----------- | ------------------ |
| [level]  | [tool/tsconfig/eslint/prettier/script] | [file:line] | [specific change]  |

## Gate Results

| Workspace | Command | Exit code | Errors | Warnings |
| --------- | ------- | --------- | ------ | -------- |
| [name]    | [gate]  | [code]    | [n]    | [n]      |

## Intentional Differences Applied

- [registry entry and evidence, or None]
```

## Deliverables

- A report that states the target tier, live Canon versions, and every inspected config.
- A `file:line` citation for each finding and each intentional-difference disposition.
- Per-workspace gate results with exit codes and measured error/warning counts.
- Valid `feature.json` records for confirmed actionable findings, using the shared severity mapping.
