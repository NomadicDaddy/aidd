# Benchmark Harness

The benchmark harness is a CLI-only v2 runner implemented in `scripts/run-benchmark.ts`.
It creates disposable fixture copies, invokes the current CLI entrypoint, reads v2
`.aidd/iterations/*.json` artifacts, and writes the preserved benchmark output files.

## What It Measures

- Stack labels (each is `<cli>-<model>-<effort/variant>`), as defined in `benchmarks/manifest.json`:
    - `native-glm51-low`, `native-glm51-medium`, `native-glm51-high`
    - `kilocode-glm52-low`, `kilocode-glm52-medium`, `kilocode-glm52-high`
    - `opencode-glm52-low`, `opencode-glm52-medium`, `opencode-glm52-high`
    - `claude-code-opus48-low`, `claude-code-opus48-medium`, `claude-code-opus48-high`, `claude-code-opus48-xhigh`, `claude-code-opus48-max`
    - `codex-gpt56-low`, `codex-gpt56-medium`, `codex-gpt56-high`, `codex-gpt56-xhigh`
    - `ollama-qwen36-latest`, `ollama-qwen36-latest-thinking`, `ollama-qwen36-27b`, `ollama-qwen36-27b-thinking`
    - `ollama-gpt-oss-20b-low`, `ollama-gpt-oss-20b-medium`, `ollama-gpt-oss-20b-high`, `ollama-gemma4-12b`
    - `lmstudio-gpt-oss-20b`, `lmstudio-gemma-4-e4b`
- Fairness cohorts defined in `benchmarks/manifest.json`
- Control tasks reported separately from the composite leaderboard

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

- v2 runs do not use the removed `--extract-structured` flag during execution.
- Preflight uses the `preflight` interview fixture and checks for `READY`.
- v2 benchmark results are a new baseline and should not be compared directly to archived v1
  leaderboard scores.
