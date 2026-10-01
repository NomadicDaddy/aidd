---
title: 'DevOps, CI/CD, and Operational Readiness Audit'
last_updated: '2026-10-01'
version: '2.4'
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

- Quality gate: `bun run smoke:qc`. The **source of truth** for the gate step set is the live smoke implementation for that repo. Spernakit uses `scripts/smoke.json` mode `qc`; aidd defines `SMOKE_QC_STEPS` in `scripts/lib/smoke-qc/steps.ts`, and `scripts/smoke-qc.ts` is the runner that imports it (the constant is not declared there). If the step set is not where this audit says, find it by following the `smoke:qc` script in `package.json`; a moved definition is a stale pointer in this audit, not a finding against the repo. Do not hard-code a fixed subset; read the live source and compare it to the CI jobs that actually exist.
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

Before running any checklist, determine which parts of this audit actually apply to the target repo. **Detect the shape; do not assume it.** This audit names jobs, files, and artifacts that exist in some targets and not in others, and every such name is a claim with a shelf life. Read the live workflows and classify the target first. Applying the CI/container Critical checks to a repo that is correct without them produces incorrect Critical findings.

- **No `.github/workflows/` present**: the CI-pipeline checks (Sections 1, 2, and the branch-protection portion of Section 4) are **N/A**. Report "operated locally / no CI"; do **not** raise these as Critical. Only the repo-hygiene checks that apply locally (lockfile committed, secret hygiene) remain in scope.
- **CI present, no `Dockerfile` and no image-publishing job** (aidd itself: `ci.yml` with `quality` and `browser-smoke`, `release.yml`, `pages.yml`, no Dockerfile, no `docker` or `ghcr` in any workflow): Sections 1, 2, 4, and 5 apply in full. The image-publishing (Section 3), image-scanning, and image-rollback checks are **N/A**, and so is every check that names a `build` or `docker-publish` **job**. The absence of those jobs is expected, not a finding.
- **`Dockerfile` present but no workflow publishes an image**: Section 3's registry checks are **N/A** for CI. Do not file a "missing `docker-publish` job" finding until you have established from the repo's own release documentation that it is meant to publish an image from CI. Image scanning still applies wherever a workflow builds the image.
- **Source- or binary-distribution repos**: the release artifact is whatever `release.yml` publishes. aidd ships as source: the release is a GitHub release on a `v*` tag and GitHub generates the source archives from the tag. Substitute "prior tag and its GitHub release remain retrievable" (or "published binary via `gh release`" for a repo that attaches binaries) as the rollback/reversibility target in Section 5 instead of a GHCR image tag.
- **Containerized + CI repo that publishes an image**: the full audit applies.

When a section is gated out, mark its checklist items **N/A** in the report rather than failing them. Marking a check N/A is permitted ONLY after confirming the thing it covers truly does not exist in the target; if a degenerate equivalent exists (e.g. a single `quality` job that runs the build inside `smoke:qc` in place of a separate `build` job, or a source release in place of an image), audit that equivalent.

## Scope

- **In scope**: `.github/workflows/*.yml`, the repo's smoke orchestrator (`scripts/smoke.ts` + `scripts/smoke.json`, `scripts/smoke-qc.ts` + `scripts/lib/smoke-qc/steps.ts`, or equivalent), `Dockerfile`, `bun.lock`, branch protection rules, pinned action versions, release tagging, dependency update automation, secret scanning, and pre-commit hooks. Branch protection and secret-scanning settings live on GitHub, not in the tree: they can be verified only through the GitHub API or UI (see Section 4).
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

# Job inventory: the jobs that EXIST, per workflow (compare against nothing but themselves).
# The pattern assumes 4-space YAML indentation and also lists the children of `on:`
# (push, pull_request, workflow_run, workflow_dispatch): filter those out, and adjust the
# indent to the file. An empty result means the indent is wrong, not that there are no jobs.
grep -n "^    [A-Za-z0-9_-]*:$\|needs:\|uses:\|permissions:" .github/workflows/*.yml

# Branch protection (CI repos only). Needs an authenticated gh with repo read access.
# If this cannot be run, record branch protection as UNVERIFIED - never as pass or absent.
gh api repos/{owner}/{repo}/branches/main/protection

# Quality-gate source of truth (repo-specific)
test -f scripts/smoke.json && cat scripts/smoke.json
grep -rn "SMOKE_QC_STEPS" scripts/ --include="*.ts"   # find the definition, then read it
```

Record: CI present (y/n), Dockerfile present (y/n), the runtime engines actually declared by the
target, `packageManager`, the `qc` step set, and the branch-protection summary. These feed the
[Applicability Gate](#applicability-gate).

## Methodology

### 1. CI Pipeline Inventory

- Enumerate all workflows in `.github/workflows/` and every job in each, by reading the files. There is no fixed expected job set: record what exists and judge it against the [Applicability Gate](#applicability-gate), not against a list in this audit. Known shapes at the time of writing, for orientation only: aidd has `ci.yml` (`quality`, then `browser-smoke` with `needs: quality`, which uploads a failure-evidence artifact), `release.yml` (`github-release`), and `pages.yml` (`deploy`); the Spernakit template has `ci.yml` (`quality`, then `runtime`), `release.yml`, and `pages.yml`. Neither has a `build` or `docker-publish` job. Do not file a "missing `build` job", "missing `docker-publish` job", or "missing docker.yml" finding on the strength of this audit; where a repo does publish an image, that may be a job within `ci.yml` rather than a separate workflow.
- Record the inventory in the report job by job, so a job that later disappears (for example `browser-smoke`) is noticed by the next audit as a change.
- For each workflow, record: triggers (`push`, `pull_request`, tag), branches, jobs, `needs` DAG, `timeout-minutes`, `concurrency` group, and permissions block
- Confirm every third-party action is pinned by **full commit SHA** with a version comment (e.g. `uses: actions/checkout@11bd71... # v4`); tag-only pins are a finding
- Confirm Bun version in CI matches `package.json` `engines.bun` and `packageManager` (read the live value; do not assume a number). Version drift between workflow `bun-version`, Docker base image, `engines.bun`, and `packageManager` is exactly the kind of finding this check exists to catch.
- Inventory the **release workflow** (`release.yml`) and identify its trigger model by reading the `on:` block. Two models are in use: (a) `workflow_run` on the CI workflow, with the job gated on CI success **and** a version tag (aidd); (b) `push` on `v*` tags, with a step that confirms CI passed for the tagged commit before publishing (the Spernakit template). For either: `permissions: contents: write` and nothing broader; release created via `gh release create ... --verify-tag` with generated notes or a notes file. Confirm tag → release → published artifact (image, binary, or source archive) correspondence.
- **`workflow_run` releases must be closed to forks.** A `workflow_run` trigger fires for CI runs started from forks and runs with the base repository's write token. When the release uses this model, confirm the job-level `if:` requires ALL of: `github.event.workflow_run.conclusion == 'success'`, `github.event.workflow_run.event == 'push'`, `github.event.workflow_run.head_repository.full_name == github.repository`, and `startsWith(github.event.workflow_run.head_branch, 'v')` (aidd `release.yml`, job `github-release`). The `head_repository` comparison is the fork gate; a condition simplified to drop it, or to drop the `event == 'push'` test, makes the release fork-triggerable and is a **High** finding. Also confirm the checkout uses `ref: ${{ github.event.workflow_run.head_sha }}` so the released tree is the one CI passed. N/A for the tag-push model, where a fork cannot push a tag to the base repository.

### 2. Quality Gate Enforcement

- Confirm the CI gate job (named `quality` in aidd and the Spernakit template) runs the current `smoke:qc` step set that is safe in ephemeral CI. The strongest form is a single `bun run smoke:qc` step, which cannot drift from the local gate; a job that hand-lists a subset must be compared step by step against the repo's live smoke source (`scripts/smoke.json` `qc`, `SMOKE_QC_STEPS` in `scripts/lib/smoke-qc/steps.ts`, or equivalent). Any omitted local-only or build-output-dependent step must be explicitly justified in the workflow comments.
- A check that reads build output must run **after** the build that produces it, in the same job, wherever that is. Decide which checks those are by reading each script, not from its name: the set differs per repo (bundle and minification checks in both canon repos; `check:api-types` in the Spernakit template), and a check such as `check-deps` may read manifests rather than build output. Then detect which shape the target has: (a) **no separate `build` job** (aidd, and the current Spernakit template): the build and these checks are `smoke:qc` steps, so confirm in the live step set that each output-reading check is ordered after the build step, and do not report any check as missing from a `build` job that does not exist; (b) **a separate `build` job**: confirm the output-reading checks run there rather than in `quality`, and that `build` declares `needs: quality`.
- Confirm every job that follows the gate job declares `needs:` on it (aidd: `browser-smoke` needs `quality`), so a failed gate stops the pipeline
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

- **Branch protection on `main`**: required status checks include every CI gate job that exists in the target (aidd: `quality` and `browser-smoke`; add `build` only where the repo has one); PR review required for external contributors; force-push disabled; linear history preferred. **This is the one item in this section that cannot be read from the repository.** Verify it with `gh api repos/{owner}/{repo}/branches/main/protection` (or `gh api repos/{owner}/{repo}/rulesets` where rulesets are used), or from a dated screenshot of the settings page supplied by the owner. Without one of those, record it as **Unverified - requires GitHub API access**; do not pass it, and do not report it absent from the absence of evidence
- **Secret scanning**: GitHub push-protection enabled (a GitHub setting: verify through the API or record as Unverified, as for branch protection); optionally `gitleaks` or a repo-local leak guard as a CI or pre-commit step, which can be read from the tree (cross-reference SECURITY audit)
- **Dependency update automation**: dependabot or renovate configured for `bun.lock`, Docker base images, and GitHub Actions
- **Release tagging**: SemVer tags (`vX.Y.Z`) exist and correspond to the published artifact (image, binary, or GitHub release for a source-distribution repo)
- **Release automation**: for the canonical stack, automated GitHub releases are an **expected practice** (not just a nice-to-have); confirm `release.yml` creates a release with auto-generated notes when CI succeeds on a `v*` tag (see Section 1). Absence on a containerized/CI repo is a Medium finding
- **Pre-commit hooks**: optional but recommended; if present, must invoke a subset of `smoke:qc` (typecheck + lint + format) and must NOT skip with `--no-verify` in documented workflows

### 5. Reproducibility & Release Reversibility

- Confirm a prior commit SHA can still produce a runnable image (base image pinned, lockfile committed, build deterministic)
- Confirm previous image tags are retained in GHCR (do not aggressively prune per-SHA tags; they are the rollback mechanism)
- Confirm the documented rollback procedure is "re-pull previous image tag and restart container". This belongs in DEPLOYMENT.md; DEVOPS audit only verifies the **artifact** is still retrievable
- For source- or binary-distribution repos (no container build), the rollback artifact is the **prior GitHub release** (its tag and source archive, plus any attached binary) rather than a GHCR image tag; verify prior releases and their tags remain retrievable instead

## Audit Checklist

### Critical Checks

> The first three items apply **only when a CI workflow actually exists**, and the image-publishing item **only when a workflow publishes an image** (see [Applicability Gate](#applicability-gate)). For local/CLI repos with no `.github/workflows/`, and for repos whose Dockerfile is never published from CI, mark the affected items **N/A**; their absence is expected, not Critical. Branch-protection items are **Unverified**, not pass or fail, when the GitHub API was not consulted.

- [ ] **Critical** (CI repos): CI runs on every push to `main` and every PR targeting `main`
- [ ] **Critical** (CI repos): the job(s) that run `typecheck`, `lint`, and the build (in aidd, the single `quality` job via `smoke:qc`) are required status checks that block merge on failure
- [ ] **Critical** (CI repos): Branch protection on `main` is enabled (no direct pushes, required checks enforced)
- [ ] **Critical** (containerized repos): Container images are published with `latest`, immutable long-SHA, and SemVer tags (rollback target)
- [ ] **Critical**: All third-party GitHub Actions are pinned by commit SHA (not tag-only)
- [ ] **Critical**: `bun install --frozen-lockfile` used in all CI jobs (no lockfile drift in CI)
- [ ] **Critical**: Secrets are referenced via `secrets.*` context only: never echoed to logs, never committed

### High Priority Checks

- [ ] **High**: CI Bun version matches `package.json` `engines.bun` (currently `>=1.4.2`) and `packageManager`
- [ ] **High**: Dockerfile base image is version-pinned (no `:latest`)
- [ ] **High**: The CI gate job runs the current repo-specific `smoke:qc` step set, with any build-output-dependent steps running after the build (inside `smoke:qc`, or in a separate `build` job where one exists) and documented
- [ ] **High** (`workflow_run` release repos): the release job is gated on `head_repository.full_name == github.repository` as well as CI success, `event == 'push'`, and a `v` tag, so a fork cannot trigger a release
- [ ] **High**: Every job has an explicit `timeout-minutes` to prevent runaway runners
- [ ] **High**: `concurrency` groups cancel superseded runs on the same ref
- [ ] **High**: Workflow `permissions:` block uses least privilege (`contents: read` default, `packages: write` only where needed)
- [ ] **High**: Previous image tags are retained in GHCR long enough to serve as rollback targets

### Medium Priority Checks

- [ ] **Medium**: Dependabot or renovate configured for Bun deps, Docker base images, and GitHub Actions
- [ ] **Medium**: SemVer release tags exist and map to the published artifact (image, binary, or GitHub release)
- [ ] **Medium** (CI repos): Automated GitHub releases via `release.yml` (generated notes or a notes file, on `v*` tags after CI success)
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
- **Branch Protection on `main`**: [Enforced / Partial / Absent / Unverified - no GitHub API access]
- **Key Risks**: [Top 3]

## Findings

### CI Pipeline Health

- Workflows: [list with triggers and every job, including non-gate jobs such as browser smoke or pages deploy]
- Release trigger model: [workflow_run + fork gate present / workflow_run, fork gate MISSING / tag push / none]
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

- Branch protection: [summary and how it was verified: gh api / screenshot / Unverified]
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
