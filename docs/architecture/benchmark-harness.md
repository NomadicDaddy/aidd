# Benchmark Harness

The benchmark harness is a CLI-only runner. `scripts/run-benchmark.ts` is the entrypoint;
the implementation lives in `scripts/lib/benchmark/`. It creates disposable fixture copies,
invokes the current CLI entrypoint, reads the `.aidd/iterations/*.json` artifacts, and writes
the preserved benchmark output files.

## What It Measures

- Stack labels (each is `<cli>-<model>-<effort/variant>`), as defined in `benchmarks/manifest.json`:
    - `native-glm53-low`, `native-glm53-medium`, `native-glm53-high`
    - `kilocode-glm53-low`, `kilocode-glm53-medium`, `kilocode-glm53-high`
    - `opencode-glm53-low`, `opencode-glm53-medium`, `opencode-glm53-high`
    - `claude-code-opus48-low`, `claude-code-opus48-medium`, `claude-code-opus48-high`, `claude-code-opus48-xhigh`, `claude-code-opus48-max`
    - `codex-gpt56-sol-low`, `codex-gpt56-sol-medium`, `codex-gpt56-sol-high`, `codex-gpt56-sol-xhigh`
    - `ollama-qwen36-latest`, `ollama-qwen36-latest-thinking`, `ollama-qwen36-27b`, `ollama-qwen36-27b-thinking`
    - `ollama-gpt-oss-20b-low`, `ollama-gpt-oss-20b-medium`, `ollama-gpt-oss-20b-high`, `ollama-gemma4-12b`
    - `lmstudio-gpt-oss-20b`, `lmstudio-gemma-4-e4b`
- Fairness cohorts defined in `benchmarks/manifest.json`
- Control tasks reported separately from the composite leaderboard

The benchmark schemas also accept `cline`. No default Cline stack is included because Cline owns
provider and model selection; add an explicit stack only when the benchmark environment pins both.

Local-model stacks (Ollama, LM Studio) need models loaded with a context window large enough for
aidd's prompts (the audit task alone sends ~58-65k tokens) and typically run with
`--skip-preflight`; see `benchmarks/README.md` for the local-model context guidance.

## Task Suite

- Control: `--version`
- Control: `--check-features`
- Control: `--check-artifacts`
- Agentic: `--interview --max-iterations 1`
- Agentic: `--audit "SPERNAKIT,REACT_BEST_PRACTICES,COMPOSITION_PATTERNS,SECURITY" --max-iterations 1`
- Agentic: remediation run filtered to `remediation-benchmark-*`
- Agentic: `--validate --max-iterations 1`
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
