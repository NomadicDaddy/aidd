---
name: doc2feature
description: 'Extract claims from a prose document, verify them against the live codebase, and create feature.json remediations for confirmed issues. Use when converting interviews, audits, analyses, or handoff notes into an evidence-backed aidd backlog.'
metadata:
    aidd-category: audit-remediation
    spernakit-references: docs/template/STACK.md
---

# Document-to-Feature Triage

Convert prose documents (interview responses, audit narratives, analysis reports, handoff notes) into actionable `.aidd/features/` remediation entries by extracting claims, verifying each against the live codebase, and generating precise, verifiable feature.json specs.

## Usage

```
doc2feature <document-path | directory> [app-name]
```

- `<document-path | directory>`: Path to the prose document to process (markdown, text, or
  similar), **or** a directory of prose documents. When a directory is given (e.g. an interview's
  `.aidd/responses/`), process every `*.md` inside it as one combined claim corpus — read them all,
  extract claims across the whole set, and deduplicate claims that recur between files. A pure index
  file (a table of links with no prose answers, such as `.aidd/responses.md`) is not a source
  document; skip it and read the files it links instead.
- `[app-name]`: Optional. If omitted, infer it from a document/directory path under
  `<applications-root>/<app-name>/.aidd/responses/`. If inference fails, return a usage error with
  the discovered candidate paths.

## Definitions

- **Claim**: A statement in the document that asserts a specific deficiency, gap, vulnerability, placeholder, incomplete implementation, missing enforcement, or incorrect behavior exists in the codebase, with enough specificity to locate and verify
- **Verification**: Reading the actual code referenced by a claim to confirm or refute its accuracy against the current codebase state
- **Remediation feature**: A feature.json with `id` matching `remediation-{YYYYMMDD}-{slug}` that describes what must be verified to confirm the issue is fixed
- **Duplicate**: An existing `.aidd/features/` entry whose description, affected files, or root cause already covers this claim

## Instructions

### Phase 1: Ingest & Parse Document(s)

1. **Resolve the input path** and confirm it is readable; if not, stop and report:
    - **File**: process that single document.
    - **Directory**: enumerate every `*.md` inside it and process them as one combined corpus.
      Skip pure index files (a table of links with no prose answers, e.g. `.aidd/responses.md`) and
      read the linked response files instead. If the directory contains no readable prose document,
      stop and report.
2. **Determine the target application**:
    - If `app-name` argument is provided, use it
    - If the input lives under `<applications-root>/{app-name}/`, infer from the path
    - If neither works, return a usage error with discovered candidates
3. **Locate the application** at `<applications-root>/{app-name}/`; confirm it exists
4. **Read the full document(s)** into context
5. **Report**:
    - Each document filename and path (for a directory, the full list processed and any skipped)
    - Target application
    - Document structure (headings, sections, estimated length)
    - Any date indicators (creation date, referenced timeframe)

When multiple documents are processed together, treat claims that recur across files as a single
claim (deduplicate in Phase 3) rather than emitting one feature per file.

### Phase 2: Learn the Codebase (Lightweight)

Before extracting claims, build enough context to verify them intelligently.

#### 2a. Project Identity

- Read `package.json` (root) for: `name`, `version`, `spernakit_version`, and script names
- Read `.aidd/project.md` if present for project-specific directives
- Read `.aidd/docs/template/STACK.md` (staged; `<spernakit-root>/docs/template/STACK.md` in the Spernakit repository) for canonical architectural rules

#### 2b. Backend Topology

- List `backend/src/routes/` to map route files to domain areas
- List `backend/src/services/` to map service files to domain areas
- List `backend/src/db/schema/` for the data model inventory
- Identify the route registration file (`backend/src/create-api-app.ts` or `backend/src/app.ts`)
- Note the API prefix convention (`/api/v1/` vs `/api/`)

#### 2c. Frontend Topology

- List `frontend/src/pages/` to map page directories to URL paths
- List `frontend/src/api/` to map API client modules to domain areas
- Identify the actual route registration files. Current Spernakit apps use
  `frontend/src/routes.tsx` with `frontend/src/routes/lazyPages.ts`; aidd uses
  `frontend/src/App.tsx`. Do not assume one layout for other stacks.
- Identify navigation config (sidebar config or nav constants)

#### 2d. Existing Feature Deduplication Index

- Read all `.aidd/features/*/feature.json` files
- **Identify template features**: entries with `spernakit_version` field. These are template-owned and must not be modified locally. If a claim targets code covered by a template feature, the remediation must note the upstream dependency (see Phase 6).
- Identify remediation-type entries: ID starts with `remediation-` or `audit-`, or description contains "bug", "fix", "remediation", or "audit" language
- Build a deduplication index: for each existing feature, note its `id`, `description`, `affectedFiles`, and any specific code references in its `spec`

#### 2e. Prior Response Review

Check for `.aidd/response-review.md`. If present, read it in full. This file is a human-authored critical review of the raw interview responses (the same documents this skill ingests), containing:

- **Hallucination flags**: Claims the interviewer identified as fabricated, inaccurate, or contradicted by the actual codebase (e.g., a response citing version `0.6.0` when `package.json` has no `version` field)
- **Confirmed findings**: Claims the reviewer verified as accurate, with cross-references to specific code locations
- **Severity and priority assessments**: The reviewer's judgment on which issues are real blockers vs. noise
- **Context corrections**: Where the response mischaracterized behavior that is actually by-design, or conflated two different issues

Build a lookup from each claim/issue described in the review to its assessment. This context is applied in Phase 4 (verification) and Phase 6 (actionability gate) to avoid creating features for hallucinated claims and to calibrate priority more accurately.

Summarize findings as a brief "Codebase Map" used throughout triage.

### Phase 3: Extract Claims from Document

Systematically read the document and identify every distinct actionable claim.

#### What is a claim

A claim is a statement asserting that something in the codebase is deficient, broken, missing, incomplete, insecure, or incorrect. Each claim must reference specific code artifacts (file paths, function names, endpoints, components, database tables, or configuration keys) to be actionable.

#### Extraction process

1. **Read each section** of the document sequentially
2. **For each assertion** about codebase state, capture:
    - Temporary ID (`claim-001`, `claim-002`, etc.)
    - The assertion text (quoted from the document)
    - Referenced file(s), function(s), endpoint(s), or component(s)
    - Nature of the issue (security, completeness, correctness, performance, architecture)
    - Whether the document provides evidence (line numbers, code snippets, function signatures)
3. **Group claims** that clearly share the same root cause into candidate consolidation groups
4. **Assign each claim a preliminary issue type** (see Root Cause Classification in Phase 4b)

#### What is NOT a claim (exclude these)

- **Design intent or architecture philosophy**: "The sidecar is intended to be permanent" - this is context, not a defect
- **Competitive analysis or market positioning**: "The top 3 competitors are..." - business strategy, not code
- **Process recommendations**: "Audit verbal commitments with stakeholders" - not a code fix
- **Pricing or business model observations**: "No pricing exists in the codebase" - a business decision, not a bug
- **Deferred v2+ scope explicitly acknowledged**: "This is aspirational for v2+" - intentionally deferred
- **Statements about what IS working correctly**: "The data model and UI are complete" - not a defect
- **Domain knowledge or background context**: "SQL Server DMVs expose..." - informational
- **Recommendations for documentation**: "Document the minimum-privilege guidance" - unless the project has specific requirements
- **Performance observations without evidence of a problem**: "SQLite may struggle under load" - speculative

**Output**: A numbered list of extracted claims with preliminary categorization and consolidation groups.

### Phase 4: Verify Each Claim Against Codebase

For every extracted claim, perform actual codebase verification. This is the critical step; do not trust the document blindly.

#### 4a. Verification Process

For each claim:

1. **Read the specific file(s)** referenced in the claim
2. **Check whether the described behavior/code** actually exists at the described location
3. **Check whether the issue has been fixed** since the document was written (the codebase is the source of truth, not the document)
4. **Cross-reference the response review** (if loaded in Phase 2e): If the review flagged this claim as hallucinated, inaccurate, or by-design, weight that assessment during verification. A claim the review already debunked should require stronger codebase evidence to override the review's assessment. Conversely, a claim the review confirmed can proceed with higher confidence. Record whether the review corroborated or contradicted the claim.
5. **Classify the verification result**:

| Result                | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `CONFIRMED`           | Issue exists exactly as described                                         |
| `PARTIALLY_CONFIRMED` | Issue exists but scope or severity differs from description               |
| `STALE`               | Issue existed but has been fixed since the document was written           |
| `NOT_FOUND`           | Referenced code/file does not exist; claim cannot be verified             |
| `INFORMATIONAL`       | Claim is accurate but describes a design choice, not an actionable defect |

#### 4b. Root Cause Classification

For `CONFIRMED` and `PARTIALLY_CONFIRMED` claims, classify the root cause:

| Class                     | Code                   | Meaning                                                             |
| ------------------------- | ---------------------- | ------------------------------------------------------------------- |
| Frontend render           | `FE-RENDER`            | Component crash, blank page, wrong state, wrong display             |
| Frontend form             | `FE-FORM`              | Validation gap, submit error, field behavior                        |
| Frontend routing          | `FE-ROUTE`             | Wrong redirect, protected route leak, 404                           |
| API contract              | `API-CONTRACT`         | Frontend expects shape backend doesn't return                       |
| Backend logic             | `BE-LOGIC`             | Service returns wrong data, wrong business rule                     |
| Backend validation        | `BE-VALID`             | Missing/wrong input validation allowing bad data                    |
| Backend error             | `BE-ERROR`             | Unhandled exception, wrong status code, missing guard               |
| Database                  | `DB`                   | Schema constraint, missing field, migration gap                     |
| Auth/authz                | `AUTH`                 | Wrong role required, missing auth guard, token issue                |
| Configuration             | `CONFIG`               | Wrong config value, missing config key                              |
| Security enforcement      | `SECURITY-ENFORCEMENT` | Missing enforcement of security controls (license, rate limit, CSP) |
| Incomplete implementation | `INCOMPLETE-IMPL`      | Placeholder/stub code, empty return values, in-memory-only state    |
| Not reproducible          | `NR`                   | Description too vague to locate affected area                       |
| By design                 | `BY-DESIGN`            | Behavior is intentional; document mischaracterized it               |

#### 4c. Severity Assessment

| Severity   | Priority | Criteria                                                                       |
| ---------- | -------- | ------------------------------------------------------------------------------ |
| Critical   | 1        | Data loss, security bypass, auth failure, complete feature breakage            |
| High       | 2        | Feature unusable for affected users, broken enforcement, forgeable credentials |
| Medium     | 3        | Feature degraded but workaround exists, stub returning empty data              |
| Low        | 4        | Minor issue, cosmetic, edge case with no data impact                           |
| Negligible | 5        | Enhancement request, style preference, out-of-scope suggestion                 |

If a response review was loaded and it assessed severity or priority for this claim differently than the raw document implies, prefer the review's calibration; it reflects a human judgment made after cross-referencing the full response set and the codebase.

### Phase 5: Consolidation & Deduplication

#### 5a. Intra-Document Consolidation

Multiple claims from the same document that share the same root cause should be consolidated into a single feature:

- Same affected file AND same type of defect (e.g., multiple missing enforcement checks in the same service)
- Multiple symptoms of the same root cause (e.g., five bypasses all stemming from "no signature verification")
- When consolidating, use the highest priority (lowest number) of the group
- Reference all original claim IDs in the feature's `notes`

Do NOT collapse claims with genuinely different root causes; they should remain separate even if they appear in the same document section.

#### 5b. Cross-Feature Deduplication

Check each surviving claim against the existing feature deduplication index from Phase 2d:

- An existing feature is a duplicate if its `description` or `spec` references the same file(s) and the same defect
- An existing feature with `affectedFiles` overlapping AND same issue type = likely duplicate
- An existing feature whose `title` describes the same root cause = already tracked

Mark duplicates and record which existing feature covers them.

### Phase 6: Actionability Gate

A claim must pass ALL of these to become a feature candidate:

1. **Verification result** is `CONFIRMED` or `PARTIALLY_CONFIRMED`
2. **Root cause is locatable** in specific code (not `NR` or `NOT_FOUND`)
3. **Not by-design**: The behavior is genuinely a defect or gap (not `BY-DESIGN` or `INFORMATIONAL`)
4. **Not a duplicate**: No existing feature already covers the same issue
5. **Fixable in-codebase**: The issue is not caused by an external dependency or environment
6. **Actionable scope**: Has a clear fix path, not just "this is complex" or "this needs a rewrite"
7. **Not explicitly deferred**: Not a v2+ feature with documented deferral rationale
8. **Not debunked by response review**: If a response review was loaded in Phase 2e and it flagged this claim as hallucinated, fabricated, or factually wrong, and Phase 4 verification did not find independent codebase evidence contradicting the review, the claim fails the gate. Record the review's assessment as the rejection reason.

Claims that fail the gate are recorded in the triage report but do not produce feature.json files.

**Template upstream tagging**: If a claim passes the gate AND the affected code is covered by a template feature (identified by `spernakit_version` in Phase 2d), the resulting remediation feature.json must include `"notes": "UPSTREAM: root cause is in template feature {template-feature-id}. Fold fix into Spernakit via the aidd-local consolidate-features skill after verification."` so the upstream debt is tracked and eventually synced back to the template.

### Phase 7: Triage Report

After investigating all claims, build the following structured report in working context. Continue
directly to Phase 8 without pausing for confirmation.

```markdown
## Document-to-Feature Triage Report: {app-name}

**Application**: {app-name} (spernakit v{spernakit_version})
**Source document**: {document filename}
**Response review**: {loaded | not found}
**Claims extracted**: {total} | **Confirmed**: {confirmed} | **Rejected**: {rejected}
**Date**: {today YYYY-MM-DD}

---

### Will Create ({count} feature.json files)

| #   | Feature ID                | Title            | Category | Priority | Source Claims        |
| --- | ------------------------- | ---------------- | -------- | -------- | -------------------- |
| 1   | remediation-YYYYMMDD-slug | Remediation: ... | Security | 1        | claim-001, claim-003 |

#### Detail: {feature-title} (`{feature-id}`)

- **Source claims**: `{claim-ids}` from {document filename}
- **Document quote**: "{relevant quote from source document}"
- **Verification**: {what was found when reading the actual code}
- **Affected files**: `{file1}`, `{file2}`
- **Root cause**: {class}; {1 to 2 sentence explanation}
- **Priority**: {n} ({severity label})
- **Spec preview**:
    1. Verify ...
    2. Verify ...

---

### Skipped: Duplicates ({count})

| Claim ID  | Summary       | Covered by              |
| --------- | ------------- | ----------------------- |
| claim-005 | {description} | `{existing-feature-id}` |

### Skipped: Not Actionable ({count})

| Claim ID  | Summary       | Reason                                                |
| --------- | ------------- | ----------------------------------------------------- |
| claim-007 | {description} | INFORMATIONAL: architecture description, not a defect |
| claim-008 | {description} | STALE: fixed since document was written               |
| claim-009 | {description} | NOT_FOUND: referenced file does not exist             |
| claim-010 | {description} | BY-DESIGN: intentional behavior, not a defect         |
| claim-011 | {description} | DEBUNKED: response-review flagged as hallucinated     |

---

**Writing {n} feature.json file(s) per the triage above.**
```

### Phase 8: Write Feature Files

Write each triaged feature.json directly in the same run.

#### File location

```
<applications-root>/{app-name}/.aidd/features/{feature-id}/feature.json
```

Where `{feature-id}` is the full ID (e.g., `remediation-20260403-license-no-signature`).

If at least one claim survives the actionability gate, read
[the feature-authoring contract](references/FEATURE-AUTHORING.md) completely before writing. It
defines the JSON shape, naming and formatting rules, category mapping, and issue-specific spec
requirements. When running from a staged skill, load it from
`.aidd/skills/doc2feature/references/FEATURE-AUTHORING.md`.

### Phase 8b: Roadmap Assignment (mandatory)

Feature persistence is **not complete** until every newly written `remediation-*` feature.json is assigned in `.aidd/roadmap.json`. After writing the files in Phase 8 and before the Phase 9 verification:

1. Read `<applications-root>/{app-name}/.aidd/roadmap.json`. If it does not exist, **create it first**: a single `v1.0` milestone (priority 1) mapping every existing feature directory, preserving each feature's dependencies (keyed by directory). This is the shape the coding runtime auto-creates on first run — roadmap and milestones apply to every project, so a missing file is created, never skipped — then continue with the assignment below.
2. For each remediation feature created in Phase 8, set `roadmap.features["{feature-id}"] = { "milestone": "{target}" }` (merge; preserve any existing `dependencies` on that key). The target is the current milestone: the existing milestone with the highest numeric `priority`. Do not create a new milestone. The owner may re-target any feature afterward.
3. Run `bun run aidd-tools -- roadmap:apply --project-dir <applications-root>/{app-name}` from `<aidd-root>` to propagate milestone priority + resolved dependency IDs into the new feature.json files. Report the command's updated / unchanged / errors summary so any roadmap↔feature drift is visible.

### Phase 9: Verification

After writing all files:

1. **Re-read each written file** and confirm it parses as valid JSON
2. **Confirm no orphaned directories**: each directory has a `feature.json`
3. **Confirm no ID collisions**: no two features share an `id`
4. **Report final summary**:

```markdown
## Write Summary

| Feature ID                | Title            | File                             |
| ------------------------- | ---------------- | -------------------------------- |
| remediation-YYYYMMDD-slug | Remediation: ... | .aidd/features/{id}/feature.json |

**{n} feature.json file(s) written successfully.**

Run the aidd-local `feature-review` skill to validate spec quality, or begin implementation with the highest-priority item.
```
