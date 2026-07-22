export interface AuditFindingsSectionVariables {
	auditCategory: string;
	auditName: string;
	auditNameLower: string;
}

export function renderAuditFindingsSection(variables: AuditFindingsSectionVariables): string {
	const { auditCategory, auditName, auditNameLower } = variables;
	return `### STEP 4: REPORT ISSUES AS STRUCTURED FINDINGS

**For each NEW issue found (after deduplication), include a structured finding in the final \`AIDD_RESULT\`.**

Do not create the feature directory or write \`feature.json\` yourself. aidd converts each accepted structured finding into a \`feature.json\` file, assigns it to the project roadmap when \`roadmap.json\` is present, and writes the audit report.

**Zero findings is a claim that must be earned, not a default.** If this audit produced no findings, your \`AIDD_RESULT\` entry must still carry a \`noFindingsJustification\` naming the specific files, patterns, or commands you actually inspected for this audit and why nothing qualified. Report prose with an empty findings array and no concrete per-audit evidence is a dropped contract: in a multi-audit batch where every audit comes back empty this way, aidd records the whole run as a failure rather than a clean pass. Investigate first, then report.

**Issue IDs:** aidd generates each finding's id and directory as \`audit-${auditNameLower}-{unix_timestamp}-{descriptive-slug}\` (with a numeric suffix on collisions); you do not emit ids. Because ids are assigned only AFTER your report is parsed, never link or guess \`feature.json\` paths anywhere in the report — reference findings by title and affected files instead.

**aidd-created Feature JSON Structure:**

\`\`\`json
{
  "id": "audit-${auditNameLower}-{unix_timestamp}-{descriptive-slug}",
  "title": "Brief title of the issue",
  "description": "Detailed description of the issue found",
  "status": "backlog",
  "category": "${auditCategory}",
  "dependencies": [],
  "priority": {severity_based_priority},
  "passes": false,
  "spec": "Detailed remediation steps:\\n1. Step one\\n2. Step two\\n...\\n\\nIMPORTANT: After resolving this finding, locate the feature.json file(s) in .aidd/features/ whose spec originally produced the code or pattern that caused this audit finding. Update those feature.json spec(s) to prevent this issue from being reintroduced during a feature-based rebuild.",
  "createdAt": "{ISO_timestamp}",
  "updatedAt": "{ISO_timestamp}",
  "auditSource": "${auditName}",
  "auditSeverity": "{Critical|High|Medium|Low}",
  "affectedFiles": ["path/to/file1.ts", "path/to/file2.ts"]
}
\`\`\`

**Severity to Priority Mapping:**

| Audit Severity | Feature Priority |
|----------------|------------------|
| Critical       | 1                |
| High           | 2                |
| Medium         | 3                |
| Low            | 4                |

**CRITICAL — Feedback Loop Requirement:**

Every audit finding's \`spec\` field MUST end with the following instruction (after the remediation steps):

> IMPORTANT: After resolving this finding, locate the feature.json file(s) in .aidd/features/ whose spec originally produced the code or pattern that caused this audit finding. Update those feature.json spec(s) to prevent this issue from being reintroduced during a feature-based rebuild.

This ensures audit fixes propagate back to the original feature specs, preventing regression during feature-based rebuilds.

**File Location:** aidd will create \`/.aidd/features/audit-${auditNameLower}-{unix_timestamp}-{descriptive-slug}/feature.json\` after parsing \`AIDD_RESULT\`.

---

### STEP 5: COMPOSE THE AUDIT REPORT

**Compose the audit report and return it in the \`reportMarkdown\` field of \`AIDD_RESULT\`; aidd writes it to \`/.aidd/audit-reports/${auditName}-{timestamp}.md\`.**

**Date discipline:** Substitute every \`{YYYY-MM-DD}\` placeholder below with the actual current local system date (the same value you'd get from running \`date +%F\` or reading \`new Date().toISOString().slice(0,10)\` in the local time zone). Do NOT pick a future date, a recommended-next-audit date, or a placeholder year. The harness writes the filename from the current local date and runs \`scripts/check-audit-artifact-hygiene.ts\` in \`smoke:qc\`, which fails any future-dated filename, heading, or \`**Date:**\` field.

**Score discipline:** in the PERFORMANCE, LIGHTHOUSE, and BUILD_OUTPUT audits the score is a measured claim, not a judgement. Write \`N/A\` unless this audit's \`AIDD_RESULT\` entry also declares the verified \`instruments[]\` entry that produced the number (see the MEASUREMENT CONTRACT in the result contract); aidd rewrites an unbacked score to \`SKIPPED / data-unavailable\`.

**Report Structure:**

\`\`\`markdown
# ${auditName} Audit Report - {YYYY-MM-DD}

## Executive Summary

**Audit Name:** ${auditName}
**Date:** {YYYY-MM-DD}
**Overall Score:** {X}/100
**Critical Issues:** {count}
**High Priority Issues:** {count}
**Medium Priority Issues:** {count}
**Low Priority Issues:** {count}

## Key Findings

[Bullet summary of most important findings]

## Issues by Severity

### Critical Issues (Priority 1)
[List finding titles with affected files — no feature.json links; ids are assigned after parsing]

### High Priority Issues (Priority 2)
[List finding titles with affected files]

### Medium Priority Issues (Priority 3)
[List finding titles with affected files]

### Low Priority Issues (Priority 4)
[List finding titles with affected files]

## Recommendations

### Immediate Actions (0-24 hours)
[Critical issues to address]

### Short-term Actions (1-2 weeks)
[High priority issues]

### Long-term Actions (1-3 months)
[Medium/Low priority issues]

---

**Auditor:** aidd Audit Agent
**Audit Framework:** ${auditName}
\`\`\`

---

### STEP 6: INCLUDE REPORT MARKDOWN IN AIDD_RESULT

Do not edit \`/.aidd/CHANGELOG.md\`. Put the full audit report markdown in the \`reportMarkdown\` field of \`AIDD_RESULT\`; aidd will write \`/.aidd/audit-reports/${auditName}-{timestamp}.md\`.

---`;
}
