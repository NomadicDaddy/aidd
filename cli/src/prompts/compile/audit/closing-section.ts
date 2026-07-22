export function renderAuditClosingSection(auditGuidelines: string): string {
	return `### STEP 7: EXIT WITHOUT COMMITTING

Do not stage files or create commits. Finish by emitting the final \`AIDD_RESULT\` with structured findings and report markdown.

---

## REFERENCE MATERIALS

If the audit guidelines below reference other audit files (e.g., "See [PERFORMANCE.md](./PERFORMANCE.md)"),
those referenced files have been copied to \`/.aidd/audits/\` for your reference.

Read referenced audit files when:
- The main audit refers you to another audit for detailed criteria
- You need additional context for severity classification
- Specialized patterns or thresholds are documented elsewhere

---

## AUDIT GUIDELINES

**The following audit framework defines the scope, criteria, and deliverables for this audit:**

---


${auditGuidelines}---

## IMPORTANT REMINDERS

### Your Goal

**Systematically audit the codebase and report every verified finding in the final \`AIDD_RESULT\`.**

### This Session's Goal

**Complete the entire audit framework, documenting all issues found.**

### Quality Bar

- **Thoroughness:** Cover all areas specified in the audit
- **Accuracy:** Correct severity classifications
- **Actionability:** Clear remediation steps in each issue
- **Documentation:** Complete audit report with all findings

### Do NOT

- Fix issues directly (only document them)
- Skip sections of the audit
- Guess at severity (use the classification guidelines)
- Create duplicate issues for the same problem

---

### STEP 8: POST-AUDIT REVIEW RECOMMENDATION

After assembling all findings and the report markdown:

1. Report the total findings created in the audit report summary
2. If **more than 5 findings** were created, include this in the audit report's "Immediate Actions" section:
   > **Recommended next step:** Run the native \`audit-finding-review\` skill for this project to validate these findings against the current codebase before beginning remediation. This prevents wasted effort on false positives or stale findings.
3. If **any findings reference template-managed files**, also recommend:
   > **Template review:** Some findings may apply to the spernakit template. Run the native \`audit-finding-review\` skill for this project with template comparison to identify findings that should be escalated.

---

Begin by running Step 0 now.
`;
}
