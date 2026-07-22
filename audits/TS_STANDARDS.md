---
title: 'TypeScript Repo Standards Audit'
last_updated: '2026-07-17'
version: '1.1'
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

Compare the target's devDependencies against the baseline (read live values from `spernakit/package.json` — do not trust this table if they disagree):

| Tool                         | Baseline |
| ---------------------------- | -------- |
| typescript                   | 6.0.3    |
| eslint                       | 10.7.0   |
| typescript-eslint            | 8.64.0   |
| prettier                     | 3.9.5    |
| bun (engines/packageManager) | 1.3.14   |

```bash
grep -E '"(typescript|eslint|typescript-eslint|prettier)"' package.json */package.json
grep -E '"(packageManager|bun)"' package.json
```

Tier B additionally requires **exact** pins (no `^`/`~`) for all dependencies.

### 2. tsconfig strictness matrix

Canonical shape: `spernakit/backend/tsconfig.json`. Every workspace tsconfig (backend/frontend/shared/scripts or root) must set:

`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUncheckedSideEffectImports`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `esModuleInterop`, `allowSyntheticDefaultImports`, `resolveJsonModule`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: bundler`, `target: ES2022`, `noEmit: true` (bun-runtime repos); frontend `lib` includes `ES2023`.

```bash
for f in $(git ls-files '*tsconfig*.json'); do echo "== $f"; grep -E 'noImplicitReturns|noFallthroughCasesInSwitch|noUncheckedIndexedAccess|exactOptionalPropertyTypes' "$f"; done
```

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

Tier A/B: must be byte-identical. Tier C: key values (useTabs, tabWidth 4, printWidth, singleQuote, semi, trailingComma es5) must match; plugin set may vary with the stack.

### 5. Script contract

`package.json` must expose: `typecheck`, `lint`, `format:check`, and `smoke:qc` (or a documented qc equivalent), plus `"preinstall": "bun scripts/require-bun.ts"` pointing at the no-dep guard (a bare `only-allow bun` is a finding: it needs a devDependency and bunx-downloads itself inside preinstall). Each must **execute** (a failing gate in Tier C is recorded, not hidden).

In workspace repos, run each workspace's gate **individually** — root scripts chain workspaces with `&&`, so the chain stops at the first failure and masks every workspace behind it. Record a per-workspace exit code and measured error/warning count. Never report a workspace clean without its actual measured count.

## Intentional Differences registry (not findings)

- aidd: caret ranges for prettier; bun:test in CI; `cli/` workspace; eslint/prettier `--cache`; incremental frontend build (vs composite+references); cached `smoke:qc:fast` pre-commit
- spernakit: no unit-test framework (crawltest by design); knip dead-code gate; hardcoded CI bun pin (LTS-gated)
- Independent-by-design apps: a repo that follows spernakit conventions but self-declares as independent (registered `[react+vite]` rather than `[spernakit]` in its `.aidd/project.md`) audits as Tier C, not Tier B — the workspace-root AGENTS.md registry names them
- Tier B `knip.json`: project-specific `ignore`/`ignoreBinaries` entries

## Remediation workflow

1. Cite the exact config file and key for each finding (file:line).
2. Config fixes land per-repo, one commit per repo; Tier B fixes must keep configs byte-identical to spernakit (fix in spernakit first if the baseline itself is wrong).
3. Code errors surfaced by config alignment are fixed file-by-file — never bulk-scripted (workspace-root AGENTS.md, Code Quality Standards).
4. A Tier A divergence requires either (a) alignment, or (b) the user's explicit approval plus an entry in the Intentional Differences registry in both this file and workspace-root AGENTS.md.

## Reporting checklist

- [ ] Tier determined and stated (or N/A: no TypeScript)
- [ ] Tool versions compared against live spernakit values
- [ ] Every tsconfig in the repo checked against the strictness matrix
- [ ] ESLint shape checks 1-7 walked with the actual config open
- [ ] Prettier/editorconfig diffed, not eyeballed
- [ ] Script contract executed per workspace (not just the root chain), exit codes and measured counts recorded
- [ ] Findings exclude everything in the Intentional Differences registry
