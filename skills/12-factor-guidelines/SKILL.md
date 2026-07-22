---
name: 12-factor-guidelines
description: 'Apply twelve-factor principles to backend services and deployment design, including configuration, backing services, statelessness, processes, logs, and portability. Use when designing, reviewing, or refactoring operational architecture.'
metadata:
    aidd-category: general
---

# Twelve-Factor Guidelines

Apply twelve-factor principles when designing, reviewing, or refactoring an operational
service.

## Workflow

1. Identify the service boundary, deployment model, backing services, and runtime constraints.
2. Read [the complete guidelines](references/GUIDELINES.md).
3. Evaluate all twelve factors, recording which factors apply and any justified exceptions.
4. Recommend the smallest changes that improve portability, disposability, observability, and
   environment parity.
5. Do not mutate the project unless the user has requested implementation.
6. Validate implemented changes with the repository's own quality and deployment gates.

## Output

Report satisfied factors, gaps, proposed or completed changes, exceptions, and validation
evidence.
