# Triumvirate Mode

Triumvirate mode is an opt-in orchestration wrapper for normal aidd project runs. It keeps the
existing work-selection, prompt compilation, backend adapters, iteration artifacts, and mode result
processing, but adds three review stages before real project execution:

1. Primary planning by the existing `--cli` and `--model` identity.
2. Secondary planning by `--secondary-cli` and optional `--secondary-model`.
3. Overseer synthesis by `--overseer-cli` and optional `--overseer-model`.
4. Execution by the resolved execution role. If no execution role is configured, aidd uses the
   overseer CLI/model for implementation.

The primary, secondary, and overseer stages run in a scratch planning mirror. Only the execution
stage runs in the real project directory.

## CLI Contract

Use `--triumvirate` with explicit role CLIs:

```powershell
bun run start -- --project-dir C:\path\to\your-app `
  --cli native --model glm-5.2 `
  --triumvirate `
  --secondary-cli codex `
  --overseer-cli claude-code --overseer-model "opus 4.8" `
  --exec-cli native --exec-model glm-5.2
```

Required flags when `--triumvirate` is active:

- `--secondary-cli`
- `--overseer-cli`

Optional role model flags:

- `--secondary-model`
- `--overseer-model`
- `--exec-model`

`--cli` and `--model` remain the primary planner identity. Project or user config may provide
defaults under `triumvirate`, but explicit CLI flags take precedence. `--exec-cli` is optional; when
neither CLI flags nor config provide `triumvirate.execCli`, execution falls back to the resolved
overseer backend and model.

Triumvirate mode wraps normal project work for `coding`, `audit`, `todo`, `validate`, `role`, and
custom directive runs. aidd intentionally rejects it with `--director`, `--interview`,
`--check-features`, `--check-artifacts`, and `--web`.

## Scratch Planning Mirror

Planning stages receive a scratch copy of the selected project. The mirror excludes heavy,
generated, sensitive, or stateful directories:

- `.cache`
- `.git`
- `.next`
- `.turbo`
- `.vite`
- `build`
- `coverage`
- `data`
- `dist`
- `node_modules`

Before and after every planning stage, aidd snapshots the original project with:

```powershell
git status --porcelain=v1 --untracked-files=all
```

If the original worktree changes during primary, secondary, or overseer planning, aidd aborts
before execution and writes a guard-failure artifact. This makes planning-stage mutation a hard
pre-execution failure.

aidd also snapshots each planning mirror before and after a planning stage. If a planner mutates its
scratch mirror, aidd retries that stage once from a clean mirror and records the rejected mutation in
the iteration artifact. Generated directories use the same exclusion list as mirror creation.
Retry prompts summarize large mutation lists so thousands of generated file paths do not consume
provider context limits. The full changed-path list remains in the structured artifact for
diagnosis.

## Overseer Decision Contract

Primary and secondary planners must return:

```text
AIDD_RESULT: {"planMarkdown":"<actionable plan>"}
```

The overseer must return one of:

```text
AIDD_RESULT: {"decision":"execute","finalActions":"<execution instructions>"}
AIDD_RESULT: {"decision":"abort","reason":"<why execution must not proceed>"}
```

Only an overseer `execute` decision with non-empty `finalActions` starts the execution stage. An
`abort` decision records a blocked run summary and prevents execution.

## Decisioning Artifacts

aidd stores Triumvirate evidence inside the normal iteration JSON under `triumvirate`. The existing
single-agent artifact path remains unchanged when `--triumvirate` is absent.

Top-level Triumvirate artifact fields:

- `metadata`: selected work, role identities, planning mirror exclusions, and worktree guard source.
- `primaryPlan`: primary planner stage artifact.
- `secondaryPlan`: secondary planner stage artifact.
- `overseerDecision`: overseer stage artifact.
- `decision`: parsed overseer decision with `status`, `source`, final actions or abort reason, and
  raw structured overseer result when available.
- `execution`: execution stage artifact, present only when the overseer allowed execution.
- `finalActions`: final overseer instructions, present only for execute decisions.
- `guardFailure`, `stageFailure`, `aborted`, or `invalidDecision`: failure classification fields
  when execution is prevented.

Every stage artifact records:

- `stage` and `role`
- backend and optional model
- `cwdKind`, either `planning_mirror` or `project`
- `startedAt`, `endedAt`, and `durationMs`
- `promptChars`
- selected work summary
- per-stage metrics
- assistant text, transcript, exit code, and structured result when present

This metadata supports later analysis of planning divergence, overseer decisions, role/model
performance, scratch-mirror guard failures, and execution outcomes without scraping console output.

## Web Launch Support

The bundled Runs page can launch Triumvirate project runs. Selecting Triumvirate reveals role
controls for primary, secondary, overseer, and execution. Leaving Execution set to the overseer
fallback omits `--exec-cli`, so aidd uses the overseer backend/model for implementation. The launch
API accepts the same role CLI and model fields as the CLI surface, and the web launcher emits the
corresponding aidd flags when explicit values are selected.

Run history stores the mode as `triumvirate`, keeps the primary backend/model in the existing run
columns, and relies on iteration artifacts for the detailed role and decisioning metadata.

## Validation

Tests cover Triumvirate behavior for:

- argument parsing and invalid combinations
- config and plan role resolution
- stage ordering
- overseer abort preventing execution
- original-worktree mutation guard
- planning-mirror mutation retry, generated-directory exclusions, and retry prompt path caps
- execution receiving the final overseer directive and execution role identity
- web launch command construction and route schema validation
- decisioning metadata presence in execution, abort, and guard-failure artifacts

Use the normal aidd gates after changing Triumvirate behavior:

```powershell
bun run start -- --project-dir . --check-features
bun test
bun run build:frontend
bun run smoke:qc
```
