# aidd Benchmark Harness

This benchmark harness compares aidd CLI backends on a fixed set of frequent tasks.

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
- `--seed <value>` - the run matrix is shuffled on every session; a seed makes that order
  reproducible
- `--skip-preflight` - skip the readiness probe (see the large-context note below)
- `--results-dir <dir>` - write this session's `runs.jsonl` and outputs somewhere other than
  `benchmarks/results`
- `--workspaces-dir <dir>` - place generated task workspaces somewhere other than
  `benchmarks/workspaces`

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

## Pricing

`manifest.pricing` is keyed by a cohort's `targetModelFamily`, not by stack label or model id.
A family with no entry (the local stacks) keeps whatever cost the backend reported, which for
local models is nothing. Rates are per 1M tokens, retrieved 2026-09-17.

| Family           |  Input | Output | Cache read |
| ---------------- | -----: | -----: | ---------: |
| gpt-5.6-luna     |  $0.20 |  $1.20 |      $0.02 |
| gpt-5.6-terra    |  $2.00 | $12.00 |      $0.20 |
| gpt-5.6-sol      |  $4.00 | $20.00 |      $0.40 |
| gpt-6-astra      | $10.00 | $50.00 |      $1.00 |
| claude-opus-5    |  $5.00 | $25.00 |      $0.50 |
| claude-fable-5-1 | $10.00 | $50.00 |      $0.25 |
| glm-5.3          |  $1.40 |  $4.40 |      $0.26 |

`cachedPerMtok` is the cache **read** rate; cache writes are not modelled. `reasoningPerMtok`
is deliberately absent - reasoning tokens are a subset of `outputTokens` and are already billed
at `outputPerMtok`, so setting it would double-count (see `scripts/lib/benchmark/pricing.ts`).

## Reasoning effort support

Manifest values are normalized by `normalizeReasoningEffort` in `shared/src/args/constants.ts`,
so `extra high`, `extra-high`, `extra_high` and `x-high` all become `xhigh`. For the direct-AI
(`native`) path the normalized value is sent verbatim as OpenAI-style `reasoning_effort`; there is
no per-provider clamp (`shared/src/agent/client/request.ts`).

Verified 2026-09-17 against the z.ai coding endpoint: an invalid value is rejected with
`reasoning_effort must be one of: none, minimal, low, medium, high, xhigh, max`. Validation is
therefore live, and **glm-5.3 genuinely supports `xhigh`** (and `max`, which the v3 matrix does
not use). An `xhigh` GLM stack is real data, not a silent duplicate of `high`.

Open question for the full matrix: whether the `opencode` and `kilocode` wrappers forward the
effort at all. A high-vs-xhigh probe showed kilocode reasoning tokens rising 2135 -> 3361 while
opencode was flat (2608 -> 2510) at n=1, which is within noise either way. If an `opencode` family
shows statistically identical reasoning tokens across all four efforts, suspect the wrapper is
dropping the flag rather than the model ignoring it - that would affect every opencode stack, not
just `xhigh`.

Caveats that affect how cross-provider cost should be read:

- **Tokenizer skew.** Claude 4.7+ produces roughly 30% more tokens for the same text than the
  OpenAI models. Per-token rates therefore understate Anthropic cost for identical work; compare
  dollars per completed task, never dollars per token.
- **claude-code reports real metered spend**, and `resolveCost` trusts a positive reported cost
  over the table. For those stacks these rates are a fallback only.
- **Long-context tiers are not modelled.** OpenAI charges roughly 2x above its long-context
  threshold. The heaviest task (audit-primary) sends ~58-65k tokens, which stays under it, but a
  task that grows past the threshold would be under-costed here.
- **gpt-5.6-sol pricing is promotional**, guaranteed only through 2026-11-21. Re-check before
  comparing a later session against this one.
- Batch and Flex discounts (50%) and fast-mode premiums (2x) are not modelled; the harness runs
  the standard tier.

## Local models (LM Studio)

Local models must be loaded with a **context window large enough for aidd's prompts**. The audit task
sends ~58-65k tokens and remediation ~12k; a default 8k context makes those requests fail instantly
with `HTTP 400 exceed_context_size_error`. That looks like a model failure in the results (0
correctness, ~1s duration, 0 tokens) but is purely a load-time setting; smaller tasks (control,
interview, validate, quiz) fit under 8k and pass, so the failure is easy to misread.

For LM Studio, reload each model with a large context before benchmarking (check fit first with
`--estimate-only`, verify with `lms ps`):

```powershell
# pinned, benchmarked loader configs - one model at a time
D:\infra\lmstudio\load-gpt-oss-20b.ps1      # 98304 context
D:\infra\lmstudio\load-gemma-4-e4b.ps1      # 131072 context
```

The two local stacks cannot be co-resident in 16GB, so run them as separate sessions with
`--stack`, loading the matching script first.

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
