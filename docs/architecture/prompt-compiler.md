# Prompt Compiler

Prompt text lives on disk under `prompts/`. The compiler (`compilePrompt` in
`cli/src/prompts/compile.ts`) turns the run plan plus those fragments into the single string
handed to a backend. Which fragments are selected is decided upstream by the run plan (see
[prompt-selection.md](./prompt-selection.md)); this document describes how the selected
fragments are assembled.

## Inputs

`compilePrompt(plan, options)` takes a resolved `PromptPlan` and `PromptCompilerOptions`:

| Option                    | Effect                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `rootDir`                 | Repo root used to resolve fragment paths.                                                                     |
| `projectDir`              | Project whose context digest may be loaded.                                                                   |
| `includeProjectContext`   | When not `false` (and `projectDir` is set), coding and audit runs load a prior-context digest.                |
| `includeRuntimeContext`   | When set, appends the plan variables as an `AIDD_V2_RUNTIME_CONTEXT` comment.                                 |
| `appUrl` / `appUrlStatus` | Launcher-managed app address (and its probe result) for `<app-url>` substitution and the launch context.      |
| `carryoverNote`           | One-shot corrective note from the previous iteration, rendered into the launch context.                       |
| `aiddMetadataUntracked`   | Tells the launch context that `.aidd/` is gitignored in this project.                                         |
| `leasedFeatures`          | Feature records claimed by other live runs, supplied by the orchestrator and rendered as a do-not-touch list. |

The plan carries `fragments[]`, each tagged by `kind` (`phase`, `backend`, `inline`, `audit`,
`common`, `mode`); the compiler resolves each fragment's `path` at the appropriate assembly
step.

## Assembly order

Sections are joined with a `\n\n---\n\n` separator. Empty fragments are skipped.

1. **Base / source prompt** (`compileBasePrompt`), chosen by mode:
    - `interview` → `compileInterviewPrompt`, unless the plan carries a custom directive (the
      generate-questions step does), in which case the directive wins.
    - `audit` → `compileAuditPrompt` (with the audit names resolved from the plan, and the
      project-context digest when one was loaded)
    - a custom directive (`--prompt` / `--skill`) → `compileDirective`
      (read-only when `customDirectiveReadonly`)
    - otherwise the `phase` fragment; for coding runs a non-empty **project-context digest**
      (`loadProjectContext`) is prepended.
    - `director` mode takes a dedicated path (`compileDirectorPrompt`), ahead of
      `compileBasePrompt` and without a project-context digest.
2. **Filters**: `applyFilters` prepends the milestone, feature-focus, and `--filter-by` blocks.
3. **Backend fragment**: `prompts/_cli/{backend}.md`, prepended when present. The in-process
   NativeBackend providers (`native`, `ollama`, `lmstudio`, `openai`) all resolve to
   `prompts/_cli/native.md`.
4. **Guardrails** (`applyGuardrails` in `compile/guardrails.ts`):
   `prompts/_common/hard-constraints.md`, `prompts/_common/forbidden-commands.md`, then
   `prompts/_common/artifact-git-policy.md` and `prompts/_common/skill-selection.md`, prepended.
   Skill selection requires source and permission evidence and explicit scoped replacements in
   ordinary directives as well as named skill runs. Audit-mode prompts additionally get an
   `AUDIT MODE ADJUSTMENT` section that overrides the blocked-state changelog-write flow for
   the read-only audit session.
5. **`<app-url>` substitution** (`applyAppUrl`): replaces the placeholder when the launcher
   supplied a live address; leaves it untouched otherwise.
6. **Launch context** (`renderLaunchContext`): app URL status, metadata-tracking note, and any
   carryover note, appended when present.
7. **Leased features** (`renderLeasedFeatures`): the feature records other live runs have
   claimed, appended when `leasedFeatures` is non-empty. Renders nothing in the single-run
   case, which keeps it out of every prompt snapshot.
8. **Dependency sections**: `compileDependencyGraph` (selected feature's neighborhood) and
   `compileDependencyTopology` (whole-project topology), appended when their data exists.
9. **Result contract**: the structured completion marker from `compileResultContract`,
   appended (see [prompt-selection.md](./prompt-selection.md#result-contracts)).
10. **Runtime context**: only when `includeRuntimeContext` is set, the plan variables are
    appended as an `<!-- AIDD_V2_RUNTIME_CONTEXT … -->` HTML comment.

## Snapshot key

`CompiledPrompt.snapshotKey` identifies a prompt combination:

```text
backend/mode/phase
```

## Snapshot tests

`cli/src/prompts/snapshots/` holds byte-for-byte snapshots for every combination in the matrix
defined by `cli/src/prompts/snapshot-matrix.ts`
(native/claude-code/cline/opencode/kilocode/codex/grok × coding, initializer, onboarding,
in-progress, todo, validate, audit, interview, director, directive-mutation,
directive-readonly). `ollama`, `lmstudio`, and `openai` are omitted because they compile
byte-identically to the `native` snapshots. `test/cli/snapshot-matrix.test.ts` compiles all four
native-equivalent providers in every snapshot mode and compares their complete prompt text
byte-for-byte; it also locks the matrix's coverage of every backend and `prompts/*.md` phase file.
Regenerate snapshots in the same change that alters compiler or prompt behavior:

```powershell
bun run prompt:snapshot
```

Snapshots are the safety net for prompt changes: an unexpected diff means a fragment or the
assembly order moved.
