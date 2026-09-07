---
title: 'DevOps, CI/CD, and Operational Readiness Audit'
last_updated: '2026-08-30'
version: '2.3'
category: 'Infrastructure'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# DevOps, CI/CD, and Operational Readiness Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

> **Scope boundary**: This audit focuses on **process and automation**: how code flows from commit to a release artifact (quality gates, CI workflows, image publishing, branch protection, release hygiene). Runtime deployment, monitoring, alerting, incident response, and environment configuration belong to [`DEPLOYMENT.md`](./DEPLOYMENT.md). When findings overlap (e.g. deployment pipeline health), this audit covers the **CI-side gates and publishing**; DEPLOYMENT.md covers **runtime rollout, health, and observability**.

## Audit Objectives

- Verify **reliable, reproducible** build and CI pipelines (GitHub Actions + `smoke:qc`)
- Ensure the **quality gate** (typecheck, lint, feature integration, schema parity, format, build) is enforced on every PR and push to `main`
- Confirm **container image publishing** is automated, pinned, and reproducible (GHCR)
- Validate **repo hygiene**: branch protection, pinned action SHAs, dependency update automation, secret scanning, release tagging
- Confirm **rollback and release reversibility** is possible at the artifact level (previous image tag retrievable)

## Stack Assumptions (Spernakit v3)

This audit is calibrated for the Spernakit stack: a **self-hosted, single-container Docker app** (nginx + Bun/Elysia backend managed by supervisord) typically operated by a single maintainer or small team. It does **not** assume multi-environment promotion pipelines, Vercel/Netlify platform deploys, on-call rotations, or SRE-grade SLO instrumentation. Findings that require enterprise practices (multi-region IaC, chaos engineering, formal post-mortems) should be marked Low unless explicitly scoped.

Key references the CI must respect:

- Quality gate: `bun run smoke:qc`. The **source of truth** for the gate step set is the live smoke implementation for that repo. Spernakit uses `scripts/smoke.json` mode `qc`; aidd uses `scripts/smoke-qc.ts` (`SMOKE_QC_STEPS`). Do not hard-code a fixed subset; read the live source and compare it to the CI `quality`/`build` jobs.
- Runtime: Bun matches `package.json` `engines.bun` (currently `>=1.4.2`) and
  `packageManager: bun@1.4.2`. Node.js is optional tooling compatibility in the canonical
  Spernakit manifest and has no pinned `engines.node` requirement. Verify the target manifest
  rather than inventing a Node requirement or memorizing version numbers.
- GHCR image name derived from `${GITHUB_REPOSITORY,,}`; tag matrix is `latest` (default branch), long-SHA (`type=sha,format=long`), and SemVer `{{version}}` plus `{{major}}.{{minor}}` on `v*` tags.
- Config: JSON-only (no `.env` files); `bunfig.toml` has `env = false`
- Testing: crawltest + `smoke:qc` (NO vitest / jest / @testing-library; do not recommend adding unit test frameworks)

## Table of Contents

1. [Audit Objectives](#audit-objectives)
2. [Stack Assumptions (Spernakit v3)](#stack-assumptions-spernakit-v3)
3. [Applicability Gate](#applicability-gate)
4. [Scope](#scope)
5. [Pre-audit Setup](#pre-audit-setup)
6. [Methodology](#methodology)
7. [Audit Checklist](#audit-checklist)
8. [Anti-Patterns to Flag](#anti-patterns-to-flag)
9. [Report Template](#report-template)
10. [Deliverables](#deliverables)

## Applicability Gate

Before running any checklist, determine which parts of this audit actually apply to the target repo. Several target apps (including aidd itself) are locally-operated CLIs with **no CI and no container build**; applying the CI/container Critical checks to them produces incorrect Critical findings.

- **No `.github/workflows/` present**: the CI-pipeline checks (Sections 1, 2, and the branch-protection portion of Section 4) are **N/A**. Report "operated locally / no CI"; do **not** raise these as Critical. Only the repo-hygiene checks that apply locally (lockfile committed, action SHA pinning if any workflows exist, secret hygiene) remain in scope.
- **No `Dockerfile` / no container build**: the image-publishing (Section 3), image-scanning, and image-rollback checks are **N/A**.
- **Binary-distribution repos** (e.g. aidd `build:standalone:*`): substitute "release artifact = published binary via `gh release`" as the rollback/reversibility target in Section 5 instead of a GHCR image tag.
- **Containerized + CI repo** (canonical Spernakit app): the full audit applies.

When a section is gated out, mark its checklist items **N/A** in the report rather than failing them.

## Scope

- **In scope**: `.github/workflows/*.yml`, the repo's smoke orchestrator (`scripts/smoke.ts` + `scripts/smoke.json`, `scripts/smoke-qc.ts`, or equivalent), `Dockerfile`, `bun.lock`, branch protection rules, pinned action versions, release tagging, dependency update automation, secret scanning, and pre-commit hooks.
- **Out of scope (see DEPLOYMENT.md)**: runtime health endpoints, Sentry/error tracking, log aggregation, alerting, on-call runbooks, environment variable/secret distribution at runtime, auto-scaling, CDN.

## Pre-audit Setup

Run these to establish applicability and gather the facts the checklist depends on:

```bash
# Applicability gate inputs
ls .github/workflows/ 2>/dev/null || echo "no CI"   # CI present?
test -f Dockerfile && echo "has Dockerfile" || echo "no Dockerfile"
ls docker-compose*.yml 2>/dev/null                   # container build?

# Version baseline (compare CI bun-version against these)
bun -e "const p=require('./package.json');console.log(p.engines, p.packageManager)"

# Workflow + run inventory (CI repos only)
gh workflow list
gh run list --limit 10

# Branch protection (CI repos only)
gh api repos/{owner}/{repo}/branches/main/protection

# Quality-gate source of truth (repo-specific)
test -f scripts/smoke.json && cat scripts/smoke.json
test -f scripts/smoke-qc.ts && grep -n "SMOKE_QC_STEPS" -A 80 scripts/smoke-qc.ts
```

Record: CI present (y/n), Dockerfile present (y/n), the runtime engines actually declared by the
target, `packageManager`, the `qc` step set, and the branch-protection summary. These feed the
[Applicability Gate](#applicability-gate).

## Methodology

### 1. CI Pipeline Inventory

- Enumerate all workflows in `.github/workflows/` (expected: `ci.yml` with `quality` + `build` + `docker-publish` jobs, and `release.yml`). Docker publishing is a **job within `ci.yml`**, not a separate `docker.yml`; do not file a "missing docker.yml" finding.
- For each workflow, record: triggers (`push`, `pull_request`, tag), branches, jobs, `needs` DAG, `timeout-minutes`, `concurrency` group, and permissions block
- Confirm every third-party action is pinned by **full commit SHA** with a version comment (e.g. `uses: actions/checkout@11bd71... # v4`); tag-only pins are a finding
- Confirm Bun version in CI matches `package.json` `engines.bun` and `packageManager` (read the live value; do not assume a number). Version drift between workflow `bun-version`, Docker base image, `engines.bun`, and `packageManager` is exactly the kind of finding this check exists to catch.
- Inventory the **release workflow** (`release.yml`): trigger model is `workflow_run` gated on CI success **and** a version tag (`head_branch` starting with `v`); `permissions: contents: write`; release created via `gh release create --generate-notes --verify-tag`. Confirm tag → release → image correspondence.

### 2. Quality Gate Enforcement

- Confirm the CI `quality` job runs the current `smoke:qc` step set that is safe in ephemeral CI. Use the repo's live smoke source (`scripts/smoke.json` `qc`, `scripts/smoke-qc.ts` `SMOKE_QC_STEPS`, or equivalent) rather than a fixed subset. Any omitted local-only or build-output-dependent step must be explicitly justified in the workflow comments; for the canonical template, `check:drift` is intentionally omitted in template CI, and `check:api-types` / `check-deps` run in `build`.
- Confirm `check:api-types` and `check-deps` run in the **`build`** job (not `quality`); they read the built artifact, so this placement is correct, not a gap.
- Confirm the `build` job depends on `quality` via `needs: quality`
- Confirm `bun install --frozen-lockfile` is used in every job (never `bun install` without the flag)
- Flag any job that runs lint/typecheck with `continue-on-error: true` or `|| true` suppression

### 3. Artifact / Image Publishing

- Confirm Docker image is built in CI on push to `main` (and `v*` tags) and tagged with the full matrix: `latest` (default branch), long-SHA (`type=sha,format=long`), and SemVer `{{version}}` plus `{{major}}.{{minor}}` on version tags. Image name is derived from `${GITHUB_REPOSITORY,,}`.
- Confirm login uses `secrets.GITHUB_TOKEN` with minimum `packages: write` permissions (not a long-lived PAT)
- Confirm build uses BuildKit cache (`cache-from: type=gha`, `cache-to: type=gha,mode=max`)
- Confirm the Dockerfile base image is pinned (e.g. `oven/bun:1.4.2-alpine`, not `oven/bun:latest`)
- Confirm `PUPPETEER_SKIP_DOWNLOAD=true` (or equivalent) is set to prevent flaky external downloads during container builds
- Confirm **image vulnerability scanning** runs on publish: `aquasecurity/trivy-action` with `severity: CRITICAL,HIGH`, `exit-code: 1` (fail on fixable CVEs), `ignore-unfixed: true`, and SARIF upload to GitHub Security (`github/codeql-action/upload-sarif`). This is baseline for containerized apps in the canonical stack; N/A for non-containerized repos per the [Applicability Gate](#applicability-gate).

### 4. Repo Hygiene

- **Branch protection on `main`**: required status checks include the CI `quality` and `build` jobs; PR review required for external contributors; force-push disabled; linear history preferred
- **Secret scanning**: GitHub push-protection enabled; optionally `gitleaks` as a CI step (cross-reference SECURITY audit)
- **Dependency update automation**: dependabot or renovate configured for `bun.lock`, Docker base images, and GitHub Actions
- **Release tagging**: SemVer tags (`vX.Y.Z`) exist and correspond to published images
- **Release automation**: for the canonical stack, automated GitHub releases are an **expected practice** (not just a nice-to-have); confirm `release.yml` creates a release with auto-generated notes when CI succeeds on a `v*` tag (see Section 1). Absence on a containerized/CI repo is a Medium finding
- **Pre-commit hooks**: optional but recommended; if present, must invoke a subset of `smoke:qc` (typecheck + lint + format) and must NOT skip with `--no-verify` in documented workflows

### 5. Reproducibility & Release Reversibility

- Confirm a prior commit SHA can still produce a runnable image (base image pinned, lockfile committed, build deterministic)
- Confirm previous image tags are retained in GHCR (do not aggressively prune per-SHA tags; they are the rollback mechanism)
- Confirm the documented rollback procedure is "re-pull previous image tag and restart container". This belongs in DEPLOYMENT.md; DEVOPS audit only verifies the **artifact** is still retrievable
- For binary-distribution repos (no container build), the rollback artifact is the **published binary via `gh release`** rather than a GHCR image tag; verify prior release binaries remain retrievable instead

## Audit Checklist

### Critical Checks

> The first four CI/container items apply **only when a CI workflow / Dockerfile actually exists** (see [Applicability Gate](#applicability-gate)). For local/CLI repos with no `.github/workflows/` or Dockerfile, mark them **N/A**; their absence is expected, not Critical.

- [ ] **Critical** (CI repos): CI runs on every push to `main` and every PR targeting `main`
- [ ] **Critical** (CI repos): `typecheck`, `lint`, and `build` are required status checks that block merge on failure
- [ ] **Critical** (CI repos): Branch protection on `main` is enabled (no direct pushes, required checks enforced)
- [ ] **Critical** (containerized repos): Container images are published with `latest`, immutable long-SHA, and SemVer tags (rollback target)
- [ ] **Critical**: All third-party GitHub Actions are pinned by commit SHA (not tag-only)
- [ ] **Critical**: `bun install --frozen-lockfile` used in all CI jobs (no lockfile drift in CI)
- [ ] **Critical**: Secrets are referenced via `secrets.*` context only: never echoed to logs, never committed

### High Priority Checks

- [ ] **High**: CI Bun version matches `package.json` `engines.bun` (currently `>=1.4.2`) and `packageManager`
- [ ] **High**: Dockerfile base image is version-pinned (no `:latest`)
- [ ] **High**: The CI `quality` job runs the current repo-specific `smoke:qc` step set, with any build-output-dependent steps placed in `build` and documented
- [ ] **High**: Every job has an explicit `timeout-minutes` to prevent runaway runners
- [ ] **High**: `concurrency` groups cancel superseded runs on the same ref
- [ ] **High**: Workflow `permissions:` block uses least privilege (`contents: read` default, `packages: write` only where needed)
- [ ] **High**: Previous image tags are retained in GHCR long enough to serve as rollback targets

### Medium Priority Checks

- [ ] **Medium**: Dependabot or renovate configured for Bun deps, Docker base images, and GitHub Actions
- [ ] **Medium**: SemVer release tags exist and map to published images
- [ ] **Medium** (CI repos): Automated GitHub releases via `release.yml` (auto-generated notes on `v*` tags after CI success)
- [ ] **Medium** (containerized repos): Image vulnerability scanning runs on publish: Trivy with `CRITICAL,HIGH`, `exit-code: 1`, `ignore-unfixed: true`, SARIF upload to GitHub Security
- [ ] **Medium**: Secret scanning / push protection is enabled on the repo
- [ ] **Medium**: BuildKit cache (`type=gha`) is configured to keep Docker builds under the timeout
- [ ] **Medium**: README / CONTRIBUTING documents the `smoke:qc` gate as the pre-commit expectation
- [ ] **Medium**: Workflow files include a comment block explaining non-obvious env vars (e.g. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`)

### Low Priority Checks

- [ ] **Low**: Pre-commit hook (lint-staged, husky, or equivalent) runs a fast subset of `smoke:qc`
- [ ] **Low**: CI job matrix tested against both SQLite and Postgres configs, **only if the project actually ships both dialects**; do not raise for SQLite-only self-hosted apps
- [ ] **Low**: CODEOWNERS file exists for multi-maintainer repos

## Anti-Patterns to Flag

- **Unit test frameworks**: Do NOT recommend adding vitest/jest/@testing-library; Spernakit uses `crawltest` + `smoke:qc` by design.
- **Enterprise SRE overhead**: Do NOT recommend multi-env promotion pipelines, formal on-call rotations, chaos engineering, or SLO dashboards for self-hosted single-operator apps. Flag as informational if relevant to scale-up planning, but not as findings.
- **`.env` files**: The stack is JSON-only config. Any CI step that writes `.env` files or depends on them is a finding.
- **`--no-verify` / skipped gates**: Any documented workflow that bypasses the quality gate is a Critical finding.
- **Untagged `:latest` base images**: Non-reproducible builds (High finding).
- **`continue-on-error: true` on gate jobs**: Silently passing CI is a Critical finding.

## Report Template

```markdown
# DevOps & CI/CD Audit Report - YYYY-MM-DD

## Executive Summary

- **CI Maturity**: [Low / Medium / High]
- **Workflows Inventoried**: [Count, names]
- **Quality Gate Parity with `smoke:qc`**: [Yes / Partial / No]
- **Image Publishing**: [Automated + SHA-pinned / Automated latest-only / Manual]
- **Branch Protection on `main`**: [Enforced / Partial / Absent]
- **Key Risks**: [Top 3]

## Findings

### CI Pipeline Health

- Workflows: [list with triggers and jobs]
- Pinned action SHAs: [Yes / No / Partial - list any tag-only pins]
- Frozen lockfile usage: [All jobs / Missing in: ...]
- Bun version alignment with `package.json`: [Match / Drift: CI=X, engines=Y]

### Quality Gate Enforcement

- Required status checks on `main`: [list]
- Checks present in CI but NOT in `smoke:qc`, or vice versa: [list]
- Any `continue-on-error` or suppression: [findings]

### Image Publishing

- Registry: [GHCR / other]
- Tagging strategy: [latest + long-SHA + SemVer / latest + sha / latest-only / other]
- Base image pin: [pinned to X / unpinned]
- Build cache: [GHA / none]
- Rollback tags retained: [Yes / No / Unknown]

### Repo Hygiene

- Branch protection: [summary]
- Secret scanning / push protection: [enabled / disabled]
- Dependency update automation: [dependabot / renovate / none]
- Release tagging: [SemVer tags / ad-hoc / none]
- CODEOWNERS: [present / absent / n/a]

### Cross-Audit Overlap

- Runtime rollback / health / monitoring findings: **deferred to DEPLOYMENT.md** (note findings here only if they block CI-side publishing)

## Recommendations

### Immediate (0-7 days)

- [ ] Address any Critical findings (unpinned actions, missing branch protection, suppressed gates)

### Short-term (1-4 weeks)

- [ ] Close High findings (Bun version drift, base image pins, permissions least-privilege)
- [ ] Add dependabot/renovate if missing
- [ ] Add Trivy image scanning and automated `release.yml` if missing on a containerized/CI repo (Medium)

### Long-term (1-3 months)

- [ ] Expand CI matrix to cover alternate DB engines - only if the project ships both dialects

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

The audit should produce:

- DevOps audit report at `.aidd/audit-reports/DEVOPS-YYYY-MM-DD.md`.
- CI/workflow inventory with triggers, jobs, permissions, pinned actions, and Bun versions.
- Quality-gate parity matrix comparing CI jobs to the repo's live `smoke:qc` source.
- Artifact publishing and rollback evidence for containerized or binary-distribution repos.
- Feature JSON remediation files for confirmed Critical/High/Medium findings.
