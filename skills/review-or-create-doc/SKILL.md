---
name: review-or-create-doc
description: 'Review a document for accuracy against the current application state, or create it from the current state if it does not yet exist. Use when refreshing tracked documentation that may be missing, when docs are modified or referenced for accuracy, or during a documentation audit.'
metadata:
    aidd-category: recipe-maturity
---

# Review or Create Document

Ensure a specified document is accurate and aligned with the current state of the application. If
the document does not yet exist, create it from the current application state instead of reporting
it as missing.

## Usage

```
review-or-create-doc [app] <document-path> [instructions]
```

- `[app]` → application name or path. If omitted, use the current repository.
- `<document-path>` → document to review or create, relative to the resolved application or
  absolute. A path that already includes the app directory resolves both values. A directory
  reviews every tracked document beneath it.
- `[instructions]` → optional review, correction, or authoring emphasis stated in plain language.

## Process

1. **Resolve the target**: Identify the document and application from the invocation. When the
   optional app is supplied, scope relative document paths to that application's directory.
2. **Check existence**:
    - If the document exists, run the review branch below.
    - If the document does not exist, run the create branch below.
3. **Review branch (document exists)**: Read it thoroughly and follow its internal references.
   Compare each claim, description, path, command, version, and link against the current
   application code and configuration. Correct confirmed inaccuracies, outdated information,
   missing details, and misleading statements directly while preserving accurate content and the
   document's established structure.
4. **Create branch (document missing)**: Bootstrap the document from the current application state.
   Match the project's existing documentation conventions and the artifact's established purpose.
   Ground every statement in real code, configuration, and observed behavior; do not speculate
   about features that are not implemented. Keep the result minimal, accurate, and limited to what
   the current state supports.
5. **Apply the result**: Write the corrections or the new document. aidd decides whether this run
   may write — a review-only run forbids edits outright, turning this step into describing the
   corrections you would have made or the document you would have created.

## Validation

Recheck every reported discrepancy against its source and distinguish confirmed defects from
uncertain or environment-dependent claims. For the create branch, verify every statement against
the code or configuration that supports it before writing it.

## Output

State which branch ran. For the review branch, list findings in severity order with document
locations, current evidence, and the correction each one takes; state which corrections you applied
and which you left, and state explicitly when no discrepancies are found. For the create branch,
summarize what the new document covers and what it deliberately does not cover.
