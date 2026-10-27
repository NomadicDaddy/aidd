# Benchmark Harness

The benchmark harness is a CLI-only runner. `scripts/run-benchmark.ts` is the entrypoint;
the implementation lives in `scripts/lib/benchmark/`. It creates disposable fixture copies,
invokes the current CLI entrypoint, reads the `.aidd/iterations/*.json` artifacts, and writes
the preserved benchmark output files.

## What It Measures

- Stack labels (each is `<cli>-<model>-<effort/variant>`), as defined in `benchmarks/manifest.json`:
    - `native-glm53-low`, `native-glm53-medium`, `native-glm53-high`, `native-glm53-xhigh`
    - `kilocode-glm53-low`, `kilocode-glm53-medium`, `kilocode-glm53-high`, `kilocode-glm53-xhigh`
    - `opencode-glm53-low`, `opencode-glm53-medium`, `opencode-glm53-high`, `opencode-glm53-xhigh`
    - `claude-code-opus5-low`, `claude-code-opus5-medium`, `claude-code-opus5-high`, `claude-code-opus5-xhigh`
    - `claude-code-fable51-low`, `claude-code-fable51-medium`, `claude-code-fable51-high`, `claude-code-fable51-xhigh`
    - `codex-gpt56-luna-low`, `codex-gpt56-luna-medium`, `codex-gpt56-luna-high`, `codex-gpt56-luna-xhigh`
    - `codex-gpt56-terra-low`, `codex-gpt56-terra-medium`, `codex-gpt56-terra-high`, `codex-gpt56-terra-xhigh`
    - `codex-gpt56-sol-low`, `codex-gpt56-sol-medium`, `codex-gpt56-sol-high`, `codex-gpt56-sol-xhigh`
    - `codex-gpt6-astra-low`, `codex-gpt6-astra-medium`, `codex-gpt6-astra-high`, `codex-gpt6-astra-xhigh`
    - `grok-46-low`, `grok-46-medium`, `grok-46-high`
    - `lmstudio-gpt-oss-20b`, `lmstudio-gemma-4-e4b`
- Fairness cohorts defined in `benchmarks/manifest.json`
- Control tasks reported separately from the composite leaderboard

The benchmark schemas also accept `cline` and `ollama`, but the current manifest includes neither.
Cline owns provider and model selection; add an explicit stack only when the benchmark environment
pins both.

Astra's configured fallback token-cost estimates are $10 input, $1 cached input, and $50 output
per million tokens in `manifest.pricing`. These are the harness's recorded rates, not a live pricing
quote. The flat-rate estimator does not model long-context or Fast mode pricing; see
`benchmarks/README.md` for the recorded pricing assumptions.

Local-model stacks (currently LM Studio) need models loaded with a context window large enough for
aidd's prompts (the audit task alone sends ~58-65k tokens) and typically run with
`--skip-preflight`; see `benchmarks/README.md` for the local-model context guidance.

## Task Suite

- Control: `--version`
- Control: `--check-features`
- Control: `--check-artifacts`
- Agentic: `--interview --max-iterations 1`
- Agentic: `--audit "SPERNAKIT,REACT_BEST_PRACTICES,COMPOSITION_PATTERNS,SECURITY" --max-iterations 1`
- Agentic: remediation run filtered to `remediation-benchmark-*`
- Control: `--validate --max-iterations 1` (the fixture's valid feature contracts require no model call)
- Agentic: comprehension quiz interview

## Artifacts

Benchmark runs write:

- `benchmarks/results/session.json`
- `benchmarks/results/runs.jsonl`
- `benchmarks/results/leaderboard.json`
- `benchmarks/results/leaderboard.csv`
- `benchmarks/results/report.md`

Disposable copies live in `benchmarks/workspaces/` and are safe to delete between sessions.
`--regrade` re-scores those saved workspaces, so once they are gone a regrade can only refresh
cost from each run's saved token usage; correctness stays at its recorded value.

## Commands

```powershell
bun run benchmark
bun run benchmark:dry-run
bun run benchmark:report
bun run benchmark:regrade
```

Use `--stack <label>`, `--task <id>`, `--results-dir <path>`, and
`--workspaces-dir <path>` after the script command for scoped runs.

## Notes

- Preflight uses the `preflight` interview fixture and checks for `READY`.
- Benchmark results are only comparable to results produced by the same harness version, fixture
  set, and stack labels; a manifest change starts a new baseline.
