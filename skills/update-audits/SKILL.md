---
name: update-audits
description: 'Sync aidd audit definitions (COMPOSITION_PATTERNS, REACT_BEST_PRACTICES, WEB_DESIGN_GUIDELINES) after their underlying skills change. Use when a vercel-* or web-design-guidelines skill was updated and the matching audit doc needs realignment.'
metadata:
    aidd-category: metadata
---

# Update Audits

Synchronize aidd's Vercel-derived audits with their canonical external source skills.

| Canonical source skill        | aidd audit                 | Official source                                         |
| ----------------------------- | -------------------------- | ------------------------------------------------------- |
| `vercel-composition-patterns` | `COMPOSITION_PATTERNS.md`  | https://github.com/vercel-labs/agent-skills             |
| `vercel-react-best-practices` | `REACT_BEST_PRACTICES.md`  | https://github.com/vercel-labs/agent-skills             |
| `web-design-guidelines`       | `WEB_DESIGN_GUIDELINES.md` | https://github.com/vercel-labs/web-interface-guidelines |

## Preconditions

Resolve the source in this order and report which path you took:

1. **Installed skill.** If the source skill is available to you, read it and every reference it
   directs you to read.
2. **Local AI catalog.** Otherwise, resolve `<applications-root>` from the current repository path
   or workspace configuration and read
   `<applications-root>/ai/skills/<source-skill>/SKILL.md`. Do not assume the AI catalog or its
   symlinks were propagated into the target project.
3. **Official source.** Otherwise, fetch the current upstream source (table above) if network access
   and an approved fetch tool are available.

aidd does not vendor snapshots of these sources; there is no archived fallback. Stop if none of the
three resolve — do not reconstruct upstream guidance from memory, and do not edit an audit against a
source you could not read.

## Workflow

1. Read the selected source skill and its relevant references in full.
2. Read the corresponding audit definition under `<aidd-root>/audits/` or `.aidd/audits/` in a
   staged project.
3. Inventory added, removed, and materially reworded source rules.
4. Present the proposed audit changes, then apply every evidence-backed update directly.
5. Add checks for new rules, remove checks for retired rules, and align changed guidance.
6. Preserve justified Spernakit-applicability notes and aidd-specific enforcement details.
7. Update `last_updated`; update `version` only for substantive changes.

## Validation

Verify every source rule is covered or explicitly marked inapplicable. Run the repository's audit
mapping, formatting, and self-contained validation gates.

## Output

Report which of the three source paths resolved, rule additions and removals, preserved exceptions,
files changed, version metadata, and validation evidence.
