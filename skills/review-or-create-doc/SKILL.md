---
name: review-or-create-doc
description: 'Review a document for accuracy against the current application state, or create it from the current state if it does not yet exist. Use when refreshing tracked documentation that may be missing.'
metadata:
    aidd-category: recipe-maturity
---

# Review or Create Document

Ensure a specified document is accurate and aligned with the current state of the application. If the document does not yet exist, create it from the current application state instead of reporting it as missing.

## Process

1. **Resolve the target**: Identify the document from `$ARGUMENTS`. When the argument is an application name rather than a file path, scope the work to that application's documentation directory.
2. **Check existence**:
    - If the document exists, run the review branch below.
    - If the document does not exist, run the create branch below.
3. **Review branch (document exists)**: Read it thoroughly. Compare each claim, description, and reference against the current application code and configuration. Report inaccuracies, outdated information, missing details, and misleading statements with specific references to the actual state.
4. **Create branch (document missing)**: Bootstrap the document from the current application state. Match the project's existing documentation conventions and the artifact's established purpose. Ground every statement in real code, configuration, and observed behavior; do not speculate about features that are not implemented. Keep the result minimal, accurate, and limited to what the current state supports.

## Output

State which branch ran. For the review branch, list the discrepancies found. For the create branch, write the new document and summarize what it covers and what it deliberately does not cover.
