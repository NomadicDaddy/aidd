---
name: summarize-iterations
description: 'Summarize aidd run and iteration history from .aidd/runs.jsonl, .aidd/iterations/, feature metadata, and the project changelog. Use for a recap of what happened across aidd runs or iterations for a project.'
metadata:
    aidd-category: metadata
---

# Summarize Iterations

Summarize aidd run and iteration history for a local project from `.aidd/runs.jsonl`, `.aidd/iterations/`, feature metadata, and the project changelog.

## Usage

```
summarize-iterations <app> [--since <YYYY-MM-DD>|--run <run-id>]
```

## Arguments

- `<app>` - Target app from `<applications-root>/AGENTS.md` or an explicit path containing `.aidd/`.
- `--since <YYYY-MM-DD>` - Optional lower bound for run history.
- `--run <run-id>` - Optional single run or pipeline session to inspect.

## Workflow

1. Resolve the target app and verify `.aidd/` exists.
2. Review `.aidd/runs.jsonl` first; it is the canonical run ledger.
3. For selected runs, inspect matching `.aidd/iterations/*.json` and raw `.log` files only when deeper evidence is needed.
4. Cross-check feature state in `.aidd/features/*/feature.json` and `.aidd/CHANGELOG.md` so the summary reflects shipped, pending, failed, and waiting-approval work accurately.
5. If structured iteration logs are missing but raw logs exist, run from `<aidd-root>`:

    ```bash
    bun run start -- --extract-batch --project-dir <app-dir>
    ```

6. Return the summary in chat unless the user explicitly asks for a file. Do not create a standalone report artifact by default.

## Output

Include run dates, selected work, completed feature IDs, commits created, failures or stop reasons, validation gates, and any unresolved follow-up that should become `.aidd/features/*/feature.json` backlog work.
