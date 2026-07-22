---
name: audit-review
description: 'Review and refresh an audit definition against current practices, report history, and source-skill changes. Use when audit rules may be stale, incomplete, noisy, or structurally inconsistent.'
metadata:
    aidd-category: metadata
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md
---

# Audit Review

Review and refresh aidd audit definition files (`<aidd-root>/audits/{NAME}.md`) against current best
practices, accumulated audit report history, and upstream source guidance resolved at runtime.
Produce a structured report, apply supported updates directly, and verify the result.

## Usage

```
audit-review [AUDIT_NAME]
```

If no audit name is provided, process every audit under `<aidd-root>/audits/` except
`SEVERITY_CLASSIFICATION.md` in filename order.

## Definitions

- **Audit definition file**: A markdown file in `<aidd-root>/audits/` defining an audit methodology: YAML frontmatter, executive summary, methodology sections with checklists, and a report template
- **Vercel-derived audit**: One of three audits adapted from upstream Vercel guidance. aidd does not vendor copies of these sources; resolve them at runtime per Phase 2a:
    | Audit                   | Upstream source skill         | Official source                                         |
    | ----------------------- | ----------------------------- | ------------------------------------------------------- |
    | `REACT_BEST_PRACTICES`  | `vercel-react-best-practices` | https://github.com/vercel-labs/agent-skills             |
    | `COMPOSITION_PATTERNS`  | `vercel-composition-patterns` | https://github.com/vercel-labs/agent-skills             |
    | `WEB_DESIGN_GUIDELINES` | `web-design-guidelines`       | https://github.com/vercel-labs/web-interface-guidelines |
- **Internally-authored audit**: All other audits, written from scratch based on domain expertise
- **Audit report history**: Past reports in `{app}/.aidd/audit-reports/{AUDIT_NAME}-*.md` across applications listed in `<applications-root>/AGENTS.md`
- **Spernakit applicability section**: An optional section mapping rules to the Spernakit stack (React 19 + Vite + Elysia), noting which rules apply, which do not, and providing equivalents

## Instructions

### Phase 1: Load Audit Definition

1. **Parse the argument** to identify the target audit name (e.g., `SECURITY`)
2. **If no argument**, process all `.md` files in `<aidd-root>/audits/` except `SEVERITY_CLASSIFICATION.md` in filename order
3. **Read the full audit definition** at `<aidd-root>/audits/{AUDIT_NAME}.md`
4. **Parse YAML frontmatter**: extract `title`, `last_updated`, `version`, `category`, `priority`, `estimated_time`, `frequency`, `lifecycle`, and optional fields (`consolidates`, `type`)
5. **Classify the audit**:
    - **Vercel-derived** if `AUDIT_NAME` is `REACT_BEST_PRACTICES`, `COMPOSITION_PATTERNS`, or `WEB_DESIGN_GUIDELINES`
    - **Internally-authored** otherwise
6. **Report**: audit name, current version, last updated date, classification, file size

### Phase 2: Build Review Context

Gather three categories of context needed to evaluate the audit definition.

#### 2a. Source Skill Context (Vercel-derived audits only)

Resolve the upstream source in this order and record which path you took:

1. **Installed skill.** If the corresponding source skill from the Definitions table is available to
   you, read it and every reference it directs you to read.
2. **Official source.** Otherwise, if network access and an approved fetch tool are available, read
   the current upstream source (see Definitions table; for `WEB_DESIGN_GUIDELINES` the canonical
   file is `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`).
3. **Neither available.** Skip **only** this sub-phase. Continue with Phases 2b through 7, omit the
   "Source Reference Delta" table from the Phase 5 report, and state explicitly that the
   source-delta comparison could not run and why. Do not reconstruct upstream guidance from memory,
   and do not present the remaining review as a complete sync.

When a source was resolved via step 1 or 2:

1. Build a rule inventory from the source (rule IDs, descriptions, categories)
2. Build a rule inventory from the audit definition
3. Identify:
    - **Rules in source not covered in audit** (new upstream rules)
    - **Rules in audit not in source** (removed upstream or audit-specific additions)
    - **Rules whose descriptions changed materially** in the source

#### 2b. Audit Report History

Scan across all applications listed in `<applications-root>/AGENTS.md` for past reports:

1. Resolve the current app list at runtime from `<applications-root>/AGENTS.md` (cross-check `<spernakit-root>/spernakit.psd1` if present), then search for `{app}/.aidd/audit-reports/{AUDIT_NAME}-*.md` across each resolved app
2. Count total reports found, note date range (oldest to newest)
3. Read executive summaries and findings sections of the most recent 3-5 reports
4. Extract patterns:
    - **Recurring false positives**: Rules that consistently flag issues then dismissed or marked already-handled
    - **Recurring true positives**: Rules that consistently find real issues (valuable, keep/strengthen)
    - **Score patterns**: Overall scores and common grades
    - **Missing coverage signals**: Ad-hoc findings outside the checklist (issues the methodology missed)

If no reports exist for this audit, note this and skip to Phase 2c. Do not fabricate patterns.

#### 2c. Current Stack Context

Read canonical references to verify audit rules against current technology state:

1. `.aidd/docs/template/STACK.md` (staged; `<spernakit-root>/docs/template/STACK.md` in the Spernakit repository): current technology versions and architectural rules
2. `.aidd/docs/template/DEVELOPMENT.md` (staged; `<spernakit-root>/docs/template/DEVELOPMENT.md` in the Spernakit repository): current coding conventions
3. `<spernakit-root>/package.json`: current Spernakit dependency versions (Elysia, Drizzle, React, Vite, Bun)

For non-Spernakit-specific audits (e.g., `CONVEX`), read the relevant project's `package.json` instead.

### Phase 3: Evaluate Audit Definition

Perform six evaluation dimensions on the audit definition.

#### 3a. Staleness Check

For every rule, checklist item, and code example in the audit:

- Does it reference **deprecated APIs**? (e.g., `useContext` when React 19 uses `use()`, Express patterns when stack uses Elysia, Prisma when stack uses Drizzle)
- Does it reference **outdated tool versions**? (for example, old Vite/React/Bun versions compared with current Spernakit versions)
- Does it reference **superseded patterns**? (e.g., manual `React.memo` when React Compiler handles memoization, `npm` when stack uses `bun`)
- Does it reference **removed or renamed features**? (APIs renamed in newer library versions)
- Are **code examples still valid**? Do imports resolve to correct paths?

Classify each stale item:

- **STALE-CRITICAL**: Rule is fundamentally wrong for current stack (would produce incorrect findings)
- **STALE-MINOR**: Rule is technically applicable but references outdated version numbers, tool names, or syntax

#### 3b. Coverage Gap Check

Identify areas the audit should cover but does not:

- **New framework features**: Features in current stack component versions not covered by any rule
- **New attack vectors** (security audits): Emerging concerns relevant to the stack
- **New best practices**: Patterns that have become standard since the audit was last updated
- **Stack evolution**: New architectural patterns, plugins, or conventions in the Spernakit template since `last_updated`
- **Cross-audit gaps**: Does this audit assume another audit covers something that the other audit does not?

#### 3c. False Positive Analysis

Using report history from Phase 2b:

- Rules that consistently produce findings marked as low priority, already-handled, or framework-provided across multiple applications
- Rules whose recommendations are routinely judged as over-engineered for self-hosted, small-team apps
- Rules that conflict with Spernakit architectural conventions (flagging patterns that STACK.md explicitly endorses)

For each false-positive-prone rule, determine if it should be: removed, narrowed in scope, severity downgraded, or given an exception clause.

#### 3d. Spernakit Applicability Check

If the audit has a "Spernakit Applicability" section:

- Verify the N/A rule list is still accurate (no rules incorrectly marked N/A, no newly-N/A rules missing)
- Verify the "Spernakit Equivalents" table matches current template patterns
- Check that references to Spernakit version and conventions are current

If the audit does NOT have a Spernakit Applicability section but SHOULD (because it contains framework-specific rules that differ between stacks), flag as a structural gap.

#### 3e. Frontmatter Accuracy Check

- **version**: Does it need bumping? (If content changes are recommended, version should increment)
- **last_updated**: How old is it relative to the technologies it covers?
- **estimated_time**: Based on report history, does actual execution time match the estimate?
- **lifecycle**: Is the lifecycle phase still correct?
- **category**: Does the category still accurately describe the audit's scope?
- **frequency**: Is the recommended frequency appropriate given how quickly the domain changes?

#### 3f. Structural Completeness Check

Verify the audit has all expected sections:

- [ ] YAML frontmatter (all required fields: title, last_updated, version, category, priority, estimated_time, frequency, lifecycle)
- [ ] Title heading (H1)
- [ ] Severity reference link to `SEVERITY_CLASSIFICATION.md`
- [ ] Executive summary with critical priorities, essential standards, and requirements
- [ ] Table of contents
- [ ] Pre-audit setup (tools, verification commands)
- [ ] Methodology sections with evaluation criteria and checklists
- [ ] Audit checklist (consolidated summary)
- [ ] Report template
- [ ] Deliverables or success criteria

Flag any missing sections. Note sections that exist but are thin or placeholder-quality.

### Phase 4: Classify Recommendations

Categorize all findings from Phase 3:

| Disposition     | Criteria                                                       | Action                                               |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| **UPDATE**      | Rule is stale but concept is valid                             | Rewrite rule with current APIs/patterns/versions     |
| **ADD**         | Coverage gap identified                                        | Add new rule or section                              |
| **REMOVE**      | False-positive-prone, irrelevant, or duplicated                | Delete rule or move to a different audit             |
| **NARROW**      | Rule is too broad, causing false positives                     | Tighten scope, add exceptions, or downgrade severity |
| **RESTRUCTURE** | Structural issue (missing section, wrong frontmatter)          | Fix structural element                               |
| **KEEP**        | Rule is accurate, well-scoped, and producing valuable findings | No change needed                                     |

Priority levels:

- **P1**: Would cause incorrect audit findings if not fixed (stale-critical rules, wrong Spernakit applicability)
- **P2**: Missing coverage that leaves real issues undetected
- **P3**: False-positive reduction, severity adjustments, structural polish
- **P4**: Minor wording, formatting, or version number updates

### Phase 5: Report

Output a structured report:

```markdown
## Audit Definition Review: {AUDIT_NAME}

**Audit file**: `<aidd-root>/audits/{AUDIT_NAME}.md`
**Current version**: {version}
**Last updated**: {last_updated}
**Classification**: {Vercel-derived | Internally-authored}
**Report history**: {N} reports across {M} applications ({date range})
**Date**: {today}

### Summary

| Disposition | Count | Priority breakdown    |
| ----------- | ----- | --------------------- |
| UPDATE      | {n}   | P1: {x}, P2: {y}, ... |
| ADD         | {n}   | P1: {x}, P2: {y}, ... |
| REMOVE      | {n}   | P1: {x}, P2: {y}, ... |
| NARROW      | {n}   | P1: {x}, P2: {y}, ... |
| RESTRUCTURE | {n}   | P1: {x}, P2: {y}, ... |
| KEEP        | {n}   | -                     |

### Source Reference Delta (Vercel-derived only; omit if Phase 2a was skipped)

**Source resolved via**: {installed skill `<name>` | official source `<url>` | NOT RESOLVED - delta skipped}

| Rule ID   | Status              | Detail                                    |
| --------- | ------------------- | ----------------------------------------- |
| {rule-id} | MISSING IN AUDIT    | Added to source reference since last sync |
| {rule-id} | REMOVED FROM SOURCE | No longer in source reference             |
| {rule-id} | CHANGED             | Description materially changed            |

### Stale Rules (UPDATE)

#### {rule-id/section}: {description}

- **Current text**: {brief quote of stale content}
- **Issue**: {deprecated API | outdated version | superseded pattern}
- **Recommended update**: {what it should say instead}
- **Priority**: P{n}

### Coverage Gaps (ADD)

#### {proposed-rule/section}: {description}

- **Gap type**: {new feature | new attack vector | new best practice | stack evolution}
- **Evidence**: {what makes this necessary}
- **Suggested content**: {brief description of what to add}
- **Priority**: P{n}

### False-Positive-Prone Rules (REMOVE or NARROW)

#### {rule-id/section}: {description}

- **Disposition**: {REMOVE | NARROW}
- **Report evidence**: {which reports flagged this, what happened to findings}
- **Recommendation**: {remove | narrow scope to X | add exception for Y | downgrade severity}
- **Priority**: P{n}

### Spernakit Applicability Issues

#### {issue}: {description}

- **Current state**: {what the section says}
- **Correct state**: {what it should say}
- **Priority**: P{n}

### Frontmatter Updates (RESTRUCTURE)

| Field          | Current   | Recommended | Reason                              |
| -------------- | --------- | ----------- | ----------------------------------- |
| version        | {current} | {new}       | Content changes warrant bump        |
| last_updated   | {current} | {today}     | Updated content                     |
| estimated_time | {current} | {new}       | Report history shows different time |

### Structural Issues (RESTRUCTURE)

#### {missing/thin section}

- **Issue**: {missing entirely | present but thin}
- **Recommendation**: {add section | expand section}
- **Priority**: P{n}

### Retained Rules (KEEP) - {count} rules

{Brief confirmation that these rules were reviewed and found current, accurate, and valuable.}
```

### Phase 6: Execute Changes

After presenting the report, apply every evidence-backed change directly:

1. **UPDATE**: Rewrite stale rules with current content
2. **ADD**: Insert new rules/sections at the appropriate location in the document
3. **REMOVE**: Delete identified rules or sections (if a rule belongs in a different audit, note this in the removal)
4. **NARROW**: Tighten rule scope, add exception clauses, adjust severity labels
5. **RESTRUCTURE**: Fix frontmatter, add missing sections, correct structural issues
6. **Bump version**: Minor bump for updates/narrows; major bump if significant additions/removals change audit scope
7. **Update `last_updated`**: Set to today's date
8. **Update `estimated_time`**: If report history justified a change

If the invocation names a subset of findings, apply only that subset.

### Phase 7: Verification

After executing changes:

1. Verify updated audit file has **valid YAML frontmatter** (all required fields present and correctly formatted)
2. Verify **table of contents matches actual headings** in the document
3. Verify all **internal anchor links resolve** (no broken `#section-name` links)
4. Verify **severity reference link** to `SEVERITY_CLASSIFICATION.md` is present
5. Verify **rule/checklist numbering** is sequential and consistent
6. For Vercel-derived audits where a source was resolved in Phase 2a, verify the source rule inventory is now fully covered. If Phase 2a was skipped, state that this verification could not run.
7. Report: changes made count, new version number, new file size

## Decision Guidelines

### When to UPDATE

- Rule references a specific API version that has since changed
- Code example uses imports or patterns from an older library version
- Rule description mentions a tool or framework by an outdated name
- Rule's remediation suggests a pattern that has been superseded

### When to ADD

- A major new feature in the stack has no corresponding audit coverage
- Report history shows recurring ad-hoc findings outside existing rules
- A security advisory or best-practice change affects the audit's domain
- The Spernakit template has added a new pattern not covered by existing rules

### When to REMOVE

- Rule is about a technology or pattern not used in any target application
- Rule duplicates coverage in another audit (identify which one)
- Report history shows the rule has never produced a true positive across 3+ applications
- Rule conflicts with established Spernakit architectural conventions

### When to NARROW

- Rule produces true positives in some contexts but false positives in others
- Rule's severity is higher than the actual impact observed in reports
- Rule's recommendation is consistently judged as over-engineered for the target context

### When to RESTRUCTURE

- Required frontmatter field is missing
- Expected section is absent or placeholder-quality
- Table of contents is out of sync with actual headings

## Anti-Patterns to Avoid

- Do not fabricate report history -- only cite patterns from actual reports found in Phase 2b
- Do not assume a rule is stale without checking current stack versions in Phase 2c
- Do not add coverage for technologies not used in the target stack
- Do not remove rules just because no report history exists (the audit may not have been run recently)
- Do not change the fundamental scope of an audit -- if a rule belongs in a different audit, recommend moving it rather than deleting it
- Do not defer evidence-backed changes after reporting them
- Do not bump version without actual content changes
- For Vercel-derived audits, do not blindly copy source content -- always adapt for Spernakit context
- Do not silently produce a thinner review when Phase 2a cannot resolve a source -- say so in the report
- Do not confuse this skill's purpose with the aidd-local `execute-audit` skill (this reviews the definition, not a codebase) or the aidd-local `audit-finding-review` skill (this reviews the methodology, not generated findings)
