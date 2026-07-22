---
name: powershell-guidelines
description: 'Apply PowerShell 7.6 practices for cmdlet design, modules, error handling, and style, including Spernakit and Pode backend patterns. Use when writing or reviewing PowerShell scripts, modules, or Pode services.'
metadata:
    aidd-category: general
---

# PowerShell Guidelines

Apply PowerShell 7.6 practices to scripts, modules, cmdlets, and Pode services.

## Workflow

1. Use `pwsh`; do not use Windows PowerShell or `powershell.exe`.
2. Confirm the project's PowerShell and module versions.
3. Read [the complete guidelines](references/GUIDELINES.md), selecting the sections relevant to
   the task.
4. Preserve strict error handling, approved verbs, pipeline semantics, module boundaries, and
   established Pode patterns.
5. Do not mutate the project during a review-only request.
6. Validate changes with parsing, PSScriptAnalyzer, relevant tests, and the repository's quality
   gate.

## Output

Summarize the rules applied, changes or findings, exceptions, and validation evidence.
