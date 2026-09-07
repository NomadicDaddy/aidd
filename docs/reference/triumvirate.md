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

With `--complexity-tiering`, low-complexity work skips stages 2 and 3 and goes straight from the
primary plan to execution. See [Complexity Fast Path](#complexity-fast-path).

## CLI Contract

Use `--triumvirate` with explicit role CLIs:

```powershell
bun run start -- --project-dir C:\path\to\your-app `
  --cli native --model glm-5.3 `
  --triumvirate `
  --secondary-cli codex `
  --overseer-cli claude-code --overseer-model claude-opus-4-8 `
  --exec-cli native --exec-model glm-5.3
```

Required when `--triumvirate` is active, unless supplied by config under `triumvirate`:

- `--secondary-cli`
- `--overseer-cli`

Optional role model flags:

- `--secondary-model`
- `--overseer-model`
- `--exec-model`

Optional planning flags, both off unless set:

- `--complexity-tiering` (config `complexityTieredPlanning`): low-complexity work skips the
  secondary planner and the overseer gate.
- `--consistency-gate` (config `consistencyGateEnabled`): the overseer checks the chosen plan
  against `.aidd/spec.md`, `.aidd/assertions.md`, and the selected feature's `feature.json`.

`--cli` and `--model` remain the primary planner identity. Project or user config may provide
defaults under `triumvirate`, but explicit CLI flags take precedence. `--exec-cli` is optional; when
neither CLI flags nor config provide `triumvirate.execCli`, execution falls back to the resolved
overseer backend and model.

Triumvirate mode wraps normal project work for `coding`, `audit`, `todo`, `validate`, and custom
directive runs. aidd intentionally rejects it with `--director`, `--interview`,
`--check-features`, `--check-artifacts`, and `--web`.

## Scratch Planning Mirror

Each planning role receives its own scratch copy of the selected project, reset from a clean source
copy before every attempt, so planners cannot see each other's working state. The mirror excludes
heavy, generated, sensitive, or stateful directories:

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

Symlinks whose target resolves outside the project root are skipped, so a link to `$HOME` or a
sibling checkout is never copied into a mirror.

aidd snapshots the original project once before planning and re-checks it after each planning stage
with:

```powershell
git status --porcelain=v1 --untracked-files=all
```

If the original worktree changes during primary, secondary, or overseer planning, aidd aborts
before execution and writes a guard-failure artifact. This makes planning-stage mutation a hard
pre-execution failure. The guard ignores the run's own ledgers, `.aidd/runs.jsonl` and
`.aidd/findings-ledger.jsonl`, which aidd itself appends to while the panel is running.

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

The marker is the only channel aidd reads. A planner that exits 0 without a non-empty
`planMarkdown` gets one retry with a corrective prompt; a second miss fails the stage and the run
exits with the same `missingResult` code a single-agent run uses for a missing `AIDD_RESULT`.
Assistant prose is never promoted to a plan.

The overseer must return one of:

```text
AIDD_RESULT: {"decision":"execute","finalActions":"<execution instructions>"}
AIDD_RESULT: {"decision":"abort","reason":"<why execution must not proceed>"}
```

Only an overseer `execute` decision with non-empty `finalActions` starts the execution stage. An
`abort` decision records a blocked run summary and prevents execution. Any other structured result,
including a missing one, is recorded as `invalidDecision` and also prevents execution.

Under `--consistency-gate` the execute marker may also carry `"consistencyIssues":["<issue>"]`. aidd
appends those strings to the execution prompt as gaps the execution agent must resolve or explain.
A plan that fundamentally contradicts the spec or an assertion is expected to `abort` instead.

## Complexity Fast Path

`--complexity-tiering` (config `complexityTieredPlanning`) is off by default. When it is on, aidd
scores the selected work from data already on the record - declared dependency count plus the
combined length of the title and description - and classifies it `low`, `medium`, or `high`. Work
scores `low` only when it declares no dependencies and its title plus description is under 400
characters.

Low-complexity work runs the primary planner, then executes that plan directly against the real
project directory: the secondary planner and the overseer gate are skipped, and the validated
primary `planMarkdown` becomes the final actions verbatim. Medium and high work runs the full panel.

A fast-path artifact records `complexityTier: "low"` and `skippedStages: ["secondary","overseer"]`,
and carries no `decision` field because no overseer ran.

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
- `finalActions`: final overseer instructions, present only for execute decisions and on the
  complexity fast path.
- `consistencyIssues`: overseer-flagged gaps forwarded to execution, present only when
  `--consistency-gate` produced them.
- `complexityTier` and `skippedStages`: present only on a complexity fast-path run.
- `guardFailure`, `stageFailure`, `aborted`, or `invalidDecision`: failure classification fields
  when execution is prevented. A rejected planning-mirror mutation also records
  `planningMirrorViolation` with the offending stage and changed paths.

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
- the plan-marker contract: one retry, then a `missingResult` failure with no prose fallback
- complexity tiering skipping the secondary and overseer stages for low-complexity work
- the consistency gate reaching the execution prompt as flagged issues
- the wall-clock safety envelope halting the panel between stages
- original-worktree mutation guard, including its run-ledger exemptions
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
