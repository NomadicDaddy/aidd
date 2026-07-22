---
name: reality-check
description: "Verify a file's actual implementation matches its inferred purpose. Use when reviewing unfamiliar files, debugging unexpected behavior, or validating code-to-intent alignment."
metadata:
    aidd-category: runtime
---

# Reality Check

Verify that a file's actual implementation matches what it should be doing based on its context.

## Process

1. **Infer purpose first**: Before reading the target file, review the surrounding codebase and project structure to form a logic inference of the file's purpose and intended functionality
    - State: "Inferred: {analysis}"

2. **Review actual implementation**: Thoroughly review the file in context of the surrounding code and project structure
    - State: "Actuality: {analysis}"

3. **Compare and remediate**: Compare inferred purpose versus actual implementation
    - Identify any discrepancies between what the file should do and what it actually does
    - Hypothesize about the cause of each discrepancy
    - Develop a remediation plan for any issues found

4. **Preserve the boundary**: Keep the review read-only unless the user explicitly requests
   remediation.

## Validation

Test the inferred purpose against callers, consumers, tests, and documentation. Clearly label
uncertain conclusions.

## Output

Report the inferred purpose, actual behavior, discrepancies, supporting evidence, and the smallest
appropriate remediation plan.
