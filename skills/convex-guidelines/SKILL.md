---
name: convex-guidelines
description: 'Convex (1.42.x) coding guidelines for object function and validator syntax, the table-name DB API, indexed queries, pagination, file storage, scheduling, ESLint plugin rules, and TypeScript patterns. Use when writing or reviewing Convex backend functions, schemas, or actions.'
metadata:
    aidd-category: general
---

# Convex Guidelines

Apply current Convex patterns when writing or reviewing backend functions, schemas, actions,
storage, scheduling, or query logic.

## Workflow

1. Confirm the project's installed Convex and TypeScript versions.
2. Read [the complete guidelines](references/GUIDELINES.md), selecting the sections relevant to
   the task.
3. Follow the current object syntax, validators, explicit table-name database API, indexed query,
   and function-registration requirements.
4. Do not mutate the project during a review-only request.
5. Validate changes with type checking, the Convex ESLint rules, and the repository's quality
   gate.

## Output

Summarize the applicable rules, changes or findings, exceptions, and validation results.
