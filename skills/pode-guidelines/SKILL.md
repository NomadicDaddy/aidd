---
name: pode-guidelines
description: 'Pode (2.13.x) patterns for PowerShell web services, including server setup, module strategy, JWT auth, file-based routing, error handling, rate limiting, file logging, OpenAPI, and scheduled tasks. Use when writing or reviewing Pode API or Core services.'
metadata:
    aidd-category: general
---

# Pode Guidelines

Apply the established Pode conventions in this skill when writing or reviewing API and core
services. Examples use an `App` / `APP_` placeholder prefix; match the target project's own
naming rather than copying the placeholder.

## Workflow

1. Confirm the installed Pode version and identify the API or core-service boundary.
2. Read [the complete guidelines](references/GUIDELINES.md), focusing on the sections relevant to
   the request.
3. Preserve the established server, module, authentication, routing, error, logging, OpenAPI, and
   scheduling conventions.
4. Do not mutate the project during a review-only request.
5. Validate changes with PSScriptAnalyzer, Pester or integration tests as applicable, and the
   repository's quality gate.

## Output

Report the rules applied, changes or findings, exceptions, and validation evidence.
