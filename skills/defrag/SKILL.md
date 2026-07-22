---
name: defrag
description: 'Audit the stored memories for this root, removing outdated or duplicate entries. Use to clean up, compact, deduplicate, or defragment memories.'
metadata:
    aidd-category: metadata
---

# Defrag

Audit the memories associated with the current root for duplication, contradiction, and stale
guidance.

## Workflow

1. Resolve the exact memory scope for the current project root.
2. Inventory entries and group records that describe the same decision, workflow, or fact.
3. Verify potentially stale entries against the current repository before proposing removal.
4. Present a keep, consolidate, update, or remove recommendation for each affected entry.
5. Apply evidence-backed changes through the supported memory-update mechanism; do not edit managed
   memory indexes directly.

## Output

Report duplicate groups, stale entries, conflicts, applied changes, and any uncertain records
left intact.
