---
name: refresh-project-artifacts
description: "Refresh every artifact recognized by aidd for one local application by following docs/reference/artifacts.md row by row. Use for full project-artifact maintenance, stale artifact reconciliation, or before relying on a project's blueprint, reports, and generated support files."
metadata:
    aidd-category: recipe-maturity
    aidd-contracts: >-
        review-or-create-doc, update-roadmap, update-screen-map, testing-scenarios,
        onboarding-interview, feature-review, bug2feature, doc2feature, deployment-readiness,
        document-changes, diary-entry, execute-audit, humanize-docs, prompt-guidelines
    aidd-references: docs/reference/artifacts.md
---

# Refresh Project Artifacts

Refresh one local project's complete aidd artifact catalog against its current implementation.
The staged reference is the source of truth; do not replace it with a remembered or hardcoded list.

## Usage

```text
refresh-project-artifacts <app> [--dry-run]
```

## Arguments

- `<app>` - Application name from the applications workspace or an explicit local project path.
- `--dry-run` - Inspect every catalog row and report the work without writing or touching files.

## Reference and contracts

Read `.aidd/docs/reference/artifacts.md` completely. When running inside the aidd repository and
the staged copy is absent, read `docs/reference/artifacts.md` from the repository root. Parse both
the main artifact table and the related non-aidd artifact table at runtime.

The sibling workflows named by the table are staged under `.aidd/skills/<id>/SKILL.md`. Read each
relevant contract before handling its artifact. Apply only the artifact-scoped portion of a
contract: this umbrella run does not commit, tag, push, deploy, release, bump a version, or open an
interactive interview unless the user separately granted that authority.

## Workflow

### 1. Resolve and protect the target

1. Resolve `<app>` to exactly one local project root. Stop for an ambiguous, missing, remote, or
   non-aidd target.
2. Inspect the target's `AGENTS.md`, Git status, ignore rules, current source/configuration, and
   `.aidd/.artifacts-check.json` when present. The check file is status evidence only; age alone
   does not prove content is wrong.
3. Record existing user changes before writing. Never stash, reset, discard, or overwrite unrelated
   work. Never force-add ignored `.aidd` files.
4. Build a ledger with one row for every artifact row in the reference. Record its class, current
   state, documented producer, planned action, and final outcome.

### 2. Refresh durable blueprint artifacts

Process committed artifacts in dependency order:

1. Review or create `CONTEXT.md`, `spec.md`, `assertions.md`, and `project-structure.md` from live
   evidence. Follow the staged `review-or-create-doc` contract for the three `.aidd` documents.
   Apply the documented `grill-with-docs` workflow to `CONTEXT.md` only when that external contract
   is locally available; otherwise review the file directly and record the unavailable producer.
2. Reconcile every feature record before `roadmap.json`. Use the specialized feature contracts only
   when their required input exists; never invent bugs, source documents, or feature history.
3. Reconcile `roadmap.json`, then apply its milestone/dependency mapping as the staged
   `update-roadmap` contract directs. Preserve human-authored `roadmap.md` unless live evidence
   proves it inaccurate.
4. Infer or verify `project-profile.json` from the project stack and assurance needs. Preserve
   explicit valid overrides and report choices that need an owner.
5. Refresh `screen-map.md` and `testing-scenarios.md` from reachable routes and executable behavior.
6. Refresh `questions.md` through the interview contract. Refresh response artifacts only when real
   answers exist; never fabricate interview responses.
7. Refresh `deployment.md` and fill deploy-config gaps only when the target has an established
   deployment destination. Do not deploy.
8. Review `todo.md`, `notes.md`, `maturity.json`, and `audit-profile-overrides.json`. Preserve valid
   manual decisions and scratch notes. Update only demonstrably stale structured values.
9. Refresh the current diary entry only when the project has activity not already recorded. Update
   existing project documentation and `.aidd/CHANGELOG.md` after the other edits, following their
   staged contracts without the commit, version, or release phases.

For a checked artifact that was stale but remains textually accurate after review, renew its
filesystem modification time without changing its text. Do this only in write mode and record it
as `reviewed-current`, distinct from `updated`.

### 3. Refresh generated artifacts through producers

Generated means reproducible, not disposable.

- Re-run a documented producer only when its inputs and preconditions exist. Never rewrite a
  historical report merely to make it look current.
- Audit reports may be refreshed only for profile-applicable audits; follow the staged
  `execute-audit` contract and preserve prior evidence.
- Interview review files require real response inputs. Feature-review and other session reports
  are refreshed only when their corresponding review is actually performed.
- `_common/`, `audits/`, and `skills/` are refreshed by aidd's normal staging for this run. Verify
  what was staged rather than hand-editing copied files.
- Leave `.artifacts-check.json` for the canonical `check-artifacts` validation step. A standalone
  skill run must report that recalculation as still required.

### 4. Preserve runtime, secret, and owner-controlled artifacts

Do not regenerate, normalize, truncate, delete, or backfill `runs.jsonl`, `iterations/`,
`active-runs/`, or `.stop`. They are run evidence or live control state. Do not read secret values
into output and do not edit or expose `.aidd/aidd.config.json`.

Treat `project.md`, `roadmap.md`, `notes.md`, release tags, and other rows marked manual as owner
content. Verify and report them; change only a clearly inaccurate value when the user's request
already supplies the correct replacement. Never manufacture an owner decision to make the ledger
look complete.

## Validation

1. Re-read every changed artifact against current source and configuration.
2. Parse every changed JSON file and validate feature IDs, dependencies, roadmap mappings, profile
   values, and audit overrides against their local contracts.
3. Run focused repository-native documentation, formatting, or metadata checks relevant to the
   files changed. Do not claim the application works unless its normal quality gate passes.
4. Confirm `git diff` contains only intended changes and no protected artifact was mutated.
5. In the enclosing `reconcile-project-artifacts` recipe, let the final `check-artifacts` step
   recalculate `.aidd/.artifacts-check.json`; compare its result with the ledger.

## Output

Report:

- target root and whether the run was dry;
- totals for `updated`, `created`, `reviewed-current`, `not-applicable`, `manual`, `protected`, and
  `blocked`;
- one concise outcome for every artifact row in both reference tables;
- changed paths, timestamp-only renewals, validations, and remaining owner decisions;
- whether the final artifact-status recalculation ran.

Do not call the refresh complete if any catalog row is missing from the ledger.
