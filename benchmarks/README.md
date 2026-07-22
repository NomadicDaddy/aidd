# aidd Benchmark Harness

This benchmark harness compares aidd v2 CLI backends on a fixed set of frequent tasks.

## Goals

- Compare each backend in its native-best stack
- Compare overlapping subsets after preflight readiness checks
- Keep tasks repeatable by running against disposable fixture copies

## Included Fixtures

- `preflight` - tiny interview project that asks the backend to reply `READY`
- `interview` - one-question interview fixture
- `audit` - seeded audit target with obvious issues
- `remediation` - seeded bugfix fixture with a deterministic post-run check
- `validate` - partial project used for control and validate tasks
- `quiz` - source-reading interview fixture used for semantic scoring

## Outputs

Runs write machine-readable artifacts under `benchmarks/results/`:

- `session.json` - session metadata and preflight outcomes
- `runs.jsonl` - one JSON object per scored replicate
- `leaderboard.json` - aggregated native-best and cohort summaries
- `leaderboard.csv` - flat export of aggregated task scores
- `report.md` - human-readable summary

Disposable workspaces are created under `benchmarks/workspaces/`.

## Usage

```powershell
bun scripts/run-benchmark.ts --manifest ./benchmarks/manifest.json
```

Useful modes:

- `--dry-run` - validate the manifest and print the planned run matrix
- `--report-only` - rebuild leaderboard/report files from existing `runs.jsonl`
- `--regrade` - re-score saved workspaces without model calls
- `--stack <label>` - limit execution to one or more stack labels
- `--task <id>` - limit execution to one or more task IDs

## Aggregate leaderboards

The top-level `benchmarks/results/leaderboard.{json,csv}`, `report.md`, and `leaderboard-composite.md`
combine multiple benchmark sessions (each run writes its own `runs.jsonl` under its `--results-dir`).
They are built two different ways, so **both** commands must run to refresh all four after new runs:

```bash
# leaderboard.json + leaderboard.csv + report.md — rebuilt from the master benchmarks/results/runs.jsonl
bun scripts/run-benchmark.ts --manifest ./benchmarks/manifest.json --report-only

# leaderboard-composite.md — prints to stdout, so redirect it into the file
bun scripts/aggregate-composite-matrix.ts > benchmarks/results/leaderboard-composite.md
```

A run launched with a custom `--results-dir` writes into that subdirectory only. To fold it into the
aggregate, append its `runs.jsonl` to the master `benchmarks/results/runs.jsonl` (for `--report-only`)
**and** add its directory name to `SOURCE_DIRS` in `scripts/aggregate-composite-matrix.ts` (for the
composite).

## Local models (LM Studio / Ollama)

Local models must be loaded with a **context window large enough for aidd's prompts**. The audit task
sends ~58-65k tokens and remediation ~12k; a default 8k context makes those requests fail instantly
with `HTTP 400 exceed_context_size_error`. That looks like a model failure in the results (0
correctness, ~1s duration, 0 tokens) but is purely a load-time setting; smaller tasks (control,
interview, validate, quiz) fit under 8k and pass, so the failure is easy to misread.

For LM Studio, reload each model with a large context before benchmarking (check fit first with
`--estimate-only`, verify with `lms ps`):

```bash
lms load <model> --context-length 65536 -y
```

Run large-context local stacks with **`--skip-preflight`**. The preflight readiness probe is gated by
`settings.preflight.timeoutSeconds` (default 180s), and slower large-context inference can exceed it
even though the real per-task timeouts (600-900s) are fine. Skipping preflight is safe once you have
confirmed the model responds. Run one local model at a time to avoid memory contention.

## Notes

- The runner invokes `bun cli/src/index.ts` directly.
- It reads `.aidd/iterations/*.json` for duration, outcome, token, cost, rate-limit, and error
  metrics.
- A single universal model does not exist across all adapters; cohorts are defined in the
  manifest.
