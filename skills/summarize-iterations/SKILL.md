---
name: summarize-iterations
description: 'Summarize aidd run and iteration history from .aidd/runs.jsonl, .aidd/iterations/, feature metadata, and the project changelog. Use for a recap of what happened across aidd runs or iterations for a project.'
metadata:
    aidd-category: metadata
---

# Summarize Iterations

Summarize aidd run and iteration history for a local project from `.aidd/runs.jsonl`,
`.aidd/iterations/`, feature metadata, and the project changelog.

## Usage

```
summarize-iterations <app> [--since <YYYY-MM-DD>|--run <run-id>]
```

## Arguments

- `<app>` - Bare project name resolved under the configured `applicationsRoot`, or an explicit
  path to a project containing `.aidd/`.
- `--since <YYYY-MM-DD>` - Optional lower bound for run history.
- `--run <run-id>` - Optional single project-ledger run to inspect.

## Workflow

1. Resolve the target app and verify `.aidd/` exists.
2. Review `.aidd/runs.jsonl` first; it is the canonical terminal-run ledger. Apply `--since` to
   ledger timestamps or match `--run` against the exact `runId`. Do not treat a pipeline-session ID
   as a project-ledger run ID; pipeline sessions are persisted separately by the web backend.
3. For selected runs, match `.aidd/iterations/*.json` by their `runId`. Read the paired raw `.log`
   file, identified by the same numeric filename stem, only when the ledger and structured sidecar
   do not contain enough evidence.
4. Cross-check current feature state in `.aidd/features/*/feature.json` and relevant entries in
   `.aidd/CHANGELOG.md`. Keep run outcomes (completed, failed, stopped, or parked) distinct from
   feature state (`backlog`, `in_progress`, `completed`, or `waiting_approval`).
5. If a structured sidecar is absent but a raw log exists, inspect the raw log directly and state
   the evidence gap. `--extract-batch` reads existing JSON sidecars; it does not reconstruct them
   from raw logs.
6. Return the summary in chat unless the user explicitly asks for a file. Do not create a
   standalone report artifact by default.

## Output

Include, when recorded, run dates, selected work, completed feature IDs, commits created, failures
or stop reasons, validation gates, and unresolved follow-up. Recommend new
`.aidd/features/*/feature.json` backlog work only when the evidence supports a concrete missing or
incomplete requirement.
