---
name: audit-finding-review
description: 'Review audit-sourced feature.json findings against the actual codebase to determine accuracy, necessity, template applicability, and disposition. Use when cleaning or reconciling an audit-derived feature backlog.'
metadata:
    aidd-category: audit-remediation
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md
---

# Audit Finding Review

Review all audit-sourced `.aidd/features/` findings in a specified application against the actual codebase. Determine whether each finding is accurate, necessary, over-engineered, and — for Spernakit-derived apps — whether it should apply to the Spernakit base template or only to the derived application.

**Applies to any aidd-managed project.** The accuracy, necessity, and over-engineering review is
stack-independent and is the bulk of the work. Classify the target before evaluating template
applicability:

- The Spernakit template repository is the root named `spernakit` with `scripts/init.ts`. Findings
  there are already upstream and must never be escalated into a duplicate record.
- A derived application is a different repository whose `package.json` carries
  `spernakit_version`. Template applicability is an extra dimension only for this class.
- Every other project has no template to escalate to: every finding is APP-SPECIFIC and ESCALATE
  never fires.

A `spernakit_version` on a feature is record provenance, not proof that its containing project is
derived. Never decline the review because the target is not Spernakit-derived.

## Usage

```
audit-finding-review [app]
```

If no app name is provided, infer it from the current repository or use the sole eligible application
listed in `<applications-root>/AGENTS.md`. If multiple candidates remain, return a usage error with
the candidate list instead of waiting for input.

## Definitions

- **Spernakit template**: `<spernakit-root>/` - the base template all `[spernakit]` apps derive from
- **Derived application**: Any application built from the Spernakit template
- **Audit finding**: A feature.json file created by an audit process (typically has `auditSource` field, or ID matching `audit-*` pattern, or description/spec containing remediation language)
- **Template-applicable**: A finding that identifies a gap or issue in code originating from the Spernakit template (not app-specific code)
- **App-specific**: A finding that only applies to the derived application's custom code

## Instructions

### Phase 1: Discover Audit Findings

1. **Identify the target application** from the argument, current repository, or sole eligible candidate
2. **Locate the application** at `<applications-root>/{app-name}/`
3. **Read all feature.json files** under `.aidd/features/*/feature.json`
4. **Filter to audit findings** using these heuristics (any match qualifies):
    - `auditSource` field is present
    - `id` matches pattern `audit-*` or `feature-*-audit-*`
    - `category` contains "audit" (case-insensitive)
    - `description` or `spec` contains "Remediation steps" or "audit finding"
5. **Separate non-audit features** - skip these entirely (they are regular feature specs, not findings to validate)
6. **Separate completed findings** - skip any finding with `status: completed` or `passes: true`.
   Completed process records belong to consolidation/history handling, not backlog triage.
7. **Report**: Total features found, open audit findings count, completed findings skipped, and
   non-audit features skipped

### Phase 2: Understand Both Codebases

Build context for evaluating whether findings are accurate and where they belong.

#### 2a. Learn the Target Application

- Read `package.json` for app name, version, and `spernakit_version`
- Classify the project as the Spernakit template repository, a derived application, or a project
  with no template origin using the rules above
- Identify app-specific domains (tables, routes, services, and pages that do NOT exist in Spernakit)
- Identify app-specific configuration differences
- Note which files are app-specific vs template-derived

#### 2b. Learn the Spernakit Template

**Skip this subsection entirely when the target is neither the Spernakit template repository nor a
derived application.** Record "no template origin: all findings APP-SPECIFIC" in the report and go
to Phase 3; 2c has nothing to map. A missing `<spernakit-root>` is then expected, not an error.

- Read `<spernakit-root>/package.json` for current template version
- Read `.aidd/docs/template/STACK.md` (staged; `<spernakit-root>/docs/template/STACK.md` in the Spernakit repository) for architectural rules
- Read `.aidd/docs/template/DEVELOPMENT.md` (staged; `<spernakit-root>/docs/template/DEVELOPMENT.md` in the Spernakit repository) for coding conventions
- Identify the template's file inventory (routes, services, utils, constants, schema)
- Note which patterns and files the template provides

#### 2c. Build Origin Map

For each file referenced in audit findings, determine its origin:

| Origin                | Meaning                                                                 | Example                                              |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| **TEMPLATE**          | File exists in both Spernakit and derived app, originated from template | `backend/src/services/user/userCrud.ts`              |
| **APP-SPECIFIC**      | File exists only in the derived app, not in Spernakit                   | `backend/src/services/kanban/boardService.ts`        |
| **MODIFIED-TEMPLATE** | Template-origin file with app-specific modifications                    | `backend/src/routes/auth-login.ts` with extra fields |
| **SHARED-UTIL**       | Utility/constant file from template used by app code                    | `backend/src/utils/dbHelpers.ts`                     |

### Phase 3: Evaluate Each Finding

For every audit finding, perform the following evaluation:

#### Parallel review

When you split the findings across subagents, keep each reviewer small. On summon, 76 findings
across 8 general-purpose reviewers spent about a third of the run's tokens on harness overhead
each reviewer re-sent every turn, and more on reading outside the target repository. None of it
served the review.

- **Use a read-only agent type.** Pick one limited to reading and searching files and running
  read-only shell commands. A general-purpose agent carries every tool and connector schema
  into every turn of its context, and a reviewer needs none of them.
- **Put the finding in the prompt.** Phase 1 already read every feature.json, so give each
  reviewer its findings inline: id, title, auditSource, severity, description, spec and
  affectedFiles, plus the ids of related findings elsewhere that it should weigh for
  consolidation. A reviewer should read code, not re-read records you already hold.
- **Stay in the target repository.** Reviewers read the target app, and `<spernakit-root>` only
  when Phase 2b applies. They do not inspect other repositories, installed binaries or package
  registries. Read-only measurements inside the target, such as counting records or checking a
  file's size to judge necessity, are in scope.
- **Stop when the disposition is settled.** One piece of decisive evidence is enough to
  classify; do not keep investigating a finding once its classification is clear.
- **Return edit-ready results.** Each reviewer returns, per finding: the disposition, the
  reason code, `file:line` evidence, and for DOWNGRADE the new severity plus the narrowed
  description and spec text, or for CONSOLIDATE the group and merged title. Phase 6 then applies
  them without re-reading.
- **Do not trust the finding's own verification.** Reviewers check the code themselves; this is
  the point of the step and is not a trim.

#### 3a. Accuracy Check

Verify the finding against the CURRENT codebase (not assumptions):

- **Does the described issue actually exist?** Read the affected files and check
- **Is the code pattern described in the finding actually present?** Verify line numbers, function names, file paths
- **Has the issue already been fixed** since the audit was created? Check `updatedAt` vs recent git activity
- **Is the finding a false positive?** (e.g., flagging a pattern that's actually correct for the framework)

Classify accuracy:

- **ACCURATE**: Issue exists exactly as described
- **PARTIALLY ACCURATE**: Issue exists but description is exaggerated or slightly wrong
- **STALE**: Issue existed but has been fixed since the finding was created
- **FALSE POSITIVE**: Issue does not exist; finding is incorrect

#### 3b. Necessity Check

Evaluate whether fixing this finding is worthwhile:

- **Severity vs. effort**: Is the fix proportional to the problem?
- **Real-world impact**: Does this actually affect users, performance, security, or maintainability?
- **Over-engineering risk**: Does the remediation propose unnecessary abstractions, monitoring, alerting, or tooling for a small self-hosted app?
- **Premature optimization**: Is this optimizing something that isn't a bottleneck?

Red flags for UNNECESSARY findings:

- Enterprise monitoring/alerting for a single-user or small-team app
- Abstract factory patterns for simple CRUD operations
- Custom caching layers when SQLite is fast enough
- Documentation-only findings (e.g., "add JSDoc to all functions")
- Version pinning findings when lock files already handle this
- Micro-optimizations that save negligible time (< 1ms)
- Findings that duplicate what the framework already provides (e.g., "add request validation" when Elysia + TypeBox already validates)

Classify necessity:

- **NECESSARY**: Real issue that should be fixed
- **NICE-TO-HAVE**: Minor improvement, fix if convenient
- **UNNECESSARY**: Over-engineered, premature, or negligible impact
- **ALREADY-HANDLED**: Framework, tooling, or existing patterns already address this

#### 3c. Template Applicability Check

Determine where this finding belongs:

1. **Check feature provenance first**: In a derived application, compare the mapped feature
   directory with the current Spernakit feature corpus. A matching upstream directory proves
   template ownership; `spernakit_version` on the app copy is supporting provenance, not a
   substitute for that corpus check. A marked record with no current upstream counterpart may be
   from an older template version and needs version/history verification before classification. In
   the Spernakit repository itself, marked records are locally owned source records, not copies to
   escalate.
2. **Check file origin** from the Origin Map (Phase 2c)
3. **If TEMPLATE or SHARED-UTIL origin**:
    - Does the same issue exist in `<spernakit-root>/` right now?
    - Read the equivalent file in Spernakit and verify
    - If yes: finding is **TEMPLATE-APPLICABLE**
    - If no (Spernakit already fixed it): finding is **STALE** for the template
4. **If APP-SPECIFIC origin**:
    - Finding is **APP-ONLY** by definition
    - Cannot apply to template since the code doesn't exist there
5. **If MODIFIED-TEMPLATE origin**:
    - Is the issue in the template-derived portion or the app-specific modification?
    - If template portion: **TEMPLATE-APPLICABLE**
    - If app modification: **APP-ONLY**

#### 3d. Consolidation Check

Look for findings that should be merged:

- Multiple findings about the same root cause (e.g., 6 separate "missing tests" findings)
- Multiple findings about the same file or function
- Findings that form a natural group (e.g., all dead code findings, all documentation findings)

### Phase 4: Classify Disposition

Based on the evaluation, assign each finding a disposition:

| Disposition         | Criteria                                                  | Action                                                 |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| **KEEP**            | Accurate + Necessary + app-specific or already upstream   | Leave as-is in the target backlog                      |
| **KEEP + ESCALATE** | Accurate + Necessary + template-applicable in derived app | Keep in derived app AND create equivalent in Spernakit |
| **CONSOLIDATE**     | Multiple findings about same root cause                   | Merge into single finding, remove originals            |
| **REMOVE**          | False positive, stale, already-handled, or unnecessary    | Delete the feature.json directory                      |
| **DOWNGRADE**       | Partially accurate or nice-to-have                        | Reduce severity and narrow the described scope         |

### Phase 5: Report

Output a structured report organized by disposition:

```markdown
## Audit Finding Review: {app-name}

**Application**: {app-name} (v{version}; add `spernakit v{spernakit_version}` only when derived)
**Spernakit template**: v{template-version} _(omit this line entirely for non-derived projects)_
**Findings reviewed**: {count}
**Date**: {today}

### Summary

| Disposition     | Count                     | Action                       |
| --------------- | ------------------------- | ---------------------------- |
| KEEP            | {n}                       | Retain in app backlog        |
| KEEP + ESCALATE | {n}                       | Retain + create in Spernakit |
| CONSOLIDATE     | {n} groups ({m} findings) | Merge related findings       |
| REMOVE          | {n}                       | Delete from app              |
| DOWNGRADE       | {n}                       | Reduce severity/scope        |

### REMOVE (delete these findings)

#### {finding-title} (`{finding-id}`)

- **Reason**: {false positive | stale | unnecessary | already-handled}
- **Reason Code**: {FALSE_POSITIVE | STALE | UNNECESSARY | ALREADY_HANDLED | FRAMEWORK_HANDLES}
- **Evidence**: {specific evidence from codebase, e.g., "function was refactored in commit abc123" or "Elysia already validates via TypeBox"}
- **Annotation**:
    - **finding_id**: `{finding-id}`
    - **reason_code**: `{reason_code}`
    - **audit_source**: `{audit-source}`
    - **evidence**: `{single-line evidence summary}`

### CONSOLIDATE (merge these groups)

#### Group: {group-name}

- **Merge into**: `{new-or-surviving-finding-id}`
- **Findings to merge**: {list of finding IDs}
- **Rationale**: {why they belong together}

### KEEP + ESCALATE (also applies to template)

#### {finding-title} (`{finding-id}`)

- **Template file**: `<spernakit-root>/{path}`
- **Issue confirmed in template**: {yes/no with evidence}
- **Proposed Spernakit finding ID**: `remediation-{YYYYMMDD}-{slug}`
- **Priority**: {1-5}

### KEEP (target-owned, retain as-is)

#### {finding-title} (`{finding-id}`)

- **Reason**: {why it is valid and owned by the target project}

### DOWNGRADE (reduce scope/severity)

#### {finding-title} (`{finding-id}`)

- **Original severity**: {Critical | High | Medium | Low}
- **New severity**: {Critical | High | Medium | Low}
- **Scope change**: {what to narrow}
```

For every `REMOVE` item, include the annotation block exactly once so later automation can aggregate false positive/stale patterns by audit type.

Use these `reason_code` values:

| Reason Code         | Use When                                                       |
| ------------------- | -------------------------------------------------------------- |
| `FALSE_POSITIVE`    | The finding does not exist in the current codebase             |
| `STALE`             | The finding was accurate before but has already been fixed     |
| `UNNECESSARY`       | The remediation is disproportionate or low-value               |
| `ALREADY_HANDLED`   | Existing code, tooling, or process already addresses the issue |
| `FRAMEWORK_HANDLES` | The framework/runtime handles the concern by default           |

### Phase 6: Execute Changes

After presenting the report, apply every disposition directly in the same run.

Re-verify REMOVE claims yourself before dismissing, because a dismissal writes a permanent ledger
event. Apply KEEP, DOWNGRADE and CONSOLIDATE from the reviewers' returned fields without
re-reading their findings or code.

#### Execute:

1. **REMOVE findings**: Before any removal, verify the directory exists and its name exactly
   matches the finding id. Never run a removal command if the `{finding-dir}` placeholder is
   empty or unresolved.

    For a finding whose feature.json carries both `fingerprint` and `auditSource`, run the aidd
    CLI dismiss command from the aidd checkout and let it do the whole removal:

    ```bash
    bun run start -- findings dismiss --project-dir {project-root} --feature {finding-dir} \
      --reason {dismissal-reason} --note "{report evidence, one sentence}"
    ```

    The command records one `dismissed` event in `.aidd/findings-ledger.jsonl` (the store stamps
    the timestamp and `source`), then removes `.aidd/features/{finding-dir}/` and its roadmap
    entry. It exits 1 without touching anything when the finding is not dismissable (wrong
    status, or no fingerprint), and exits 2 on a usage error such as a reason outside the
    vocabulary. If it reports that the event was recorded but the directory could not be removed,
    re-run the same command: the append is idempotent and only the removal is retried. This skill
    never writes `.aidd/findings-ledger.jsonl` directly; a hand-written line has no timestamp and
    is skipped by every later read.

    Map the `reason_code` from Phase 5 onto the `--reason` value. Every code the skill emits has
    exactly one row:

    | `reason_code`       | `--reason`        |
    | ------------------- | ----------------- |
    | `FALSE_POSITIVE`    | `false-positive`  |
    | `STALE`             | `already-handled` |
    | `ALREADY_HANDLED`   | `already-handled` |
    | `FRAMEWORK_HANDLES` | `already-handled` |
    | `UNNECESSARY`       | `not-worth-it`    |

    For a finding without both a non-empty `fingerprint` and a non-empty `auditSource` (created
    before dismissable findings existed, or by hand), there is no valid ledger event to record;
    remove the directory directly. A fingerprint alone is insufficient and the CLI will refuse it.
    If the path is git-tracked, remove it with `git rm -r .aidd/features/{finding-dir}/` so the
    removal is staged and recoverable. Otherwise, delete the verified literal directory with the
    current shell's native command (`Remove-Item -Recurse -LiteralPath` in PowerShell or
    `rm -rf --` in a POSIX shell), and drop its entry from `.aidd/roadmap.json` when one exists.

2. **CONSOLIDATE findings**:
    - Create a clean-slug app-owned feature.json (no `audit-*` or `remediation-*` process prefix)
      with:
        - A concise `id`, `title`, and category drawn from the target project's vocabulary
        - Combined description summarizing all merged findings
        - Combined spec with all unique remediation items
        - The union of verified `affectedFiles` and existing dependencies
        - A `notes` array naming every source finding ID
        - Earliest `createdAt` from the group
        - `updatedAt` set to current timestamp
        - Priority = highest (lowest number) from the group
        - `status` = "backlog", `passes` = false
    - Delete the original individual finding directories

3. **ESCALATE findings**: From a derived application only, create an equivalent feature.json in
   `<spernakit-root>/.aidd/features/` with:
    - `id` format: `remediation-{YYYYMMDD}-{slug}`, the Spernakit process-record shape consumed by
      `consolidate-features`
    - `spernakit_version` from the current Spernakit package.json
    - Spec adapted to reference Spernakit file paths (not derived app paths)
    - Verified Spernakit-relative `affectedFiles` and a `notes` array naming the source finding
    - `status` = "backlog", `passes` = false
    - `auditSeverity` matching the evaluated severity
    - `priority` matching the assigned current milestone; roadmap priority is authoritative

4. **DOWNGRADE findings**: Update the feature.json in-place:
    - Reduce `auditSeverity` to the evaluated severity; do not hand-edit `priority`, which mirrors
      the roadmap milestone
    - Narrow `description` and `spec` to actual scope
    - Update `updatedAt` to current timestamp

5. **Update counts**: Report final summary of changes made

### Phase 6.5: Pipeline Handoff

After executing changes:

1. **Count remaining KEEP findings** in the backlog
2. **If >3 KEEP findings remain**, recommend: `Run the aidd-local feature-review skill for {app} to validate remaining finding specs against codebase conventions`
3. **If any KEEP+ESCALATE findings were created in Spernakit**, recommend: `Run the aidd-local consolidate-features skill for Spernakit to integrate escalated findings with the existing backlog`
4. **If any findings were REMOVED as false positives**, note the audit type that generated them and recommend: `Run the aidd-local audit-review skill on the {audit-type} audit definition to prevent future false positives`

### Phase 6.6: Roadmap Reconciliation (mandatory)

Every feature.json create, delete, or rename in Phase 6 must be mirrored in `.aidd/roadmap.json`
before the Phase 7 verification. For each project whose features changed (the target project for
KEEP/CONSOLIDATE/REMOVE/DOWNGRADE; `<spernakit-root>` for ESCALATE):

1. Read that app's `.aidd/roadmap.json`. If it does not exist, **create it first**: a single `v1.0` milestone (priority 1) mapping every existing feature directory, preserving dependencies (keyed by directory). This is the shape the coding runtime auto-creates on first run — roadmap and milestones apply to every project, so a missing file is created, never skipped — then continue with the reconciliation below.
2. **REMOVE / folded-away findings**: delete the corresponding `roadmap.features["{finding-id}"]` entry (stale-entry cleanup).
3. **CONSOLIDATE**: delete the merged-away finding entries; assign the surviving/new consolidated feature.
4. **ESCALATE**: assign the newly created `remediation-{YYYYMMDD}-{slug}` feature in Spernakit's roadmap.json.
5. **New assignments** use `roadmap.features["{feature-id}"] = { "milestone": "{target}" }` (merge; preserve existing `dependencies`). The target is the current milestone: the existing milestone with the highest numeric `priority`. Do not create a new milestone. The owner may re-target afterward. DOWNGRADE keeps its existing milestone; only re-assert an entry exists (idempotent; no churn if already mapped).
6. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace. ESCALATE features written into Spernakit's roadmap are a separate project by definition — name them in the report as needing their own pass.

### Phase 7: Verification

After executing changes:

1. Verify all remaining feature.json files are valid JSON
2. Verify no orphaned directories remain (directories without feature.json)
3. Verify all dependency references in remaining features still resolve
4. Report final feature inventory: total remaining, by status, by category

## Decision Guidelines

### When to REMOVE

- Finding references code that no longer exists
- Framework already handles the concern (e.g., Elysia validates TypeBox schemas automatically)
- Bun built-in features cover the finding (e.g., "add test runner" when bun:test exists)
- Finding proposes enterprise-grade solutions for small self-hosted apps
- Finding is about documentation, versioning, or housekeeping with negligible value
- Finding duplicates what `smoke:qc` or ESLint already catches

### When to ESCALATE to template

- Target is a derived application, not the Spernakit repository itself
- Issue is in a file that originated from the Spernakit template
- The same issue exists in the current Spernakit codebase
- Fix would benefit ALL derived applications, not just this one
- Finding identifies a security gap, missing validation, or architectural flaw in template code

### When to CONSOLIDATE

- 3+ findings about the same category targeting the same root cause
- Multiple "dead code" findings that are all minor cleanup
- Multiple "test coverage" findings that should be a single test plan
- Multiple findings about the same file or function

### When to KEEP as app-specific

- Finding is about code unique to the derived application
- Finding addresses app-specific business logic, UI, or data model
- Template has no equivalent file or pattern

## Anti-Patterns to Avoid

- Do not fabricate evidence - always read actual files before classifying
- Do not assume a finding is accurate without checking the current codebase
- Do not escalate app-specific findings to the template
- Do not re-review findings that have already been resolved; exclude them in Phase 1
- Do not consolidate unrelated findings just to reduce count
- Do not change finding IDs of kept findings
- Do not modify findings marked `passes: true` or `status: completed` (they're already done)
- Do not skip or defer the Phase 6 changes; apply them directly
