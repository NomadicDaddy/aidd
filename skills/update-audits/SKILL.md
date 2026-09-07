---
name: update-audits
description: 'Sync aidd audit definitions (COMPOSITION_PATTERNS, REACT_BEST_PRACTICES, WEB_DESIGN_GUIDELINES) after their underlying skills change. Use when a vercel-* or web-design-guidelines skill was updated and the matching audit doc needs realignment.'
metadata:
    aidd-category: metadata
---

# Update Audits

Synchronize aidd's Vercel-derived audits with their canonical external source skills.

| Canonical source skill        | aidd audit                 | Official source                                                                        |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `vercel-composition-patterns` | `COMPOSITION_PATTERNS.md`  | https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns      |
| `vercel-react-best-practices` | `REACT_BEST_PRACTICES.md`  | https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices      |
| `web-design-guidelines`       | `WEB_DESIGN_GUIDELINES.md` | https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md |

## Preconditions

Resolve each source in this order and report which path you took for each audit:

1. **Installed skill.** If the source skill is available to you, read it and every rule or reference
   it directs you to read. A wrapper skill that directs you to fetch its current rules is not
   resolved until that fetch succeeds.
2. **Official source.** Otherwise, fetch the complete current upstream source from the table above
   if network access and an approved fetch tool are available.

In either case, resolve the exact upstream Git revision represented by the rules before editing;
the distribution registry requires a 40-character commit SHA and revision-pinned source URLs.

aidd does not vendor snapshots of these sources; there is no archived fallback. Stop if none of the
two resolve — do not reconstruct upstream guidance from memory, and do not edit an audit against a
source you could not read.

## Workflow

1. Read the selected source skill and its relevant references in full.
2. Read the corresponding audit definition under `<aidd-root>/audits/`. This skill maintains the
   aidd catalog itself, not the generated `.aidd/audits/` copies staged into managed projects.
3. Inventory added, removed, and materially reworded source rules.
4. Present the proposed audit changes, then apply every evidence-backed update directly.
5. Add checks for new rules, remove checks for retired rules, and align changed guidance.
6. Preserve justified Spernakit-applicability notes and aidd-specific enforcement details.
7. Update the audit's pinned source revision or synchronization date and `last_updated`; update
   `version` only for substantive changes.
8. When the upstream revision changes, align the matching entry in
   `licenses/distributed-materials.json`, then run `bun run licenses:generate` to regenerate
   `THIRD-PARTY-LICENSES.md` and `THIRD-PARTY-NOTICES.md`.

## Validation

Verify every source rule is covered or explicitly marked inapplicable. Audit-definition edits make
the committed evaluation attestation stale, so run `bun run test:audit-evals`, refresh it with
`bun run bench:audits`, and run `bun run check:audit-evals`. Also run
`bun run check:audit-profile-mapping`, `bun run check:licenses`, `bun run self-contained`, and
`bun run format:check`; finish with `bun run smoke:qc`.

## Output

Report the source path and exact revision resolved for each of the three audits, rule additions and
removals, preserved exceptions, files changed, audit and provenance metadata, refreshed evaluation
attestation, and validation evidence.
