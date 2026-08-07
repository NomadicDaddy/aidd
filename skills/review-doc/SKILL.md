---
name: review-doc
description: 'Review a document for accuracy against the current application state. Use when docs are modified, referenced for accuracy, or during documentation audits.'
metadata:
    aidd-category: metadata
---

# Document Review

Review a specified document for accuracy and alignment with the current state of the application.

## Usage

```
review-doc [app] <document-path> [instructions]
```

- `[app]` → application name or path. If omitted, use the current repository.
- `<document-path>` → document to review, relative to the resolved application or absolute.
- `[instructions]` → optional review or correction emphasis stated in plain language.

## Process

1. **Resolve the target**: Identify the document and the application state it describes.
2. **Review the document**: Read the complete document and follow its internal references.
3. **Compare against reality**: Check each claim, description, path, command, version, and link
   against current code and configuration.
4. **Report discrepancies**: Identify inaccurate, stale, missing, or misleading content with
   specific evidence.
5. **Apply the corrections**: Update the document to fix every discrepancy you confirmed. aidd
   decides whether this run may write — a review-only run forbids edits outright, turning this
   step into describing the corrections you would have made.

## Validation

Recheck every reported discrepancy against its source and distinguish confirmed defects from
uncertain or environment-dependent claims.

## Output

Report findings in severity order with document locations, current evidence, and the correction
each one takes. State which corrections you applied and which you left, and state explicitly when
no discrepancies are found.
