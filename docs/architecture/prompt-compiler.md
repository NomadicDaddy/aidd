# Prompt Compiler

Prompt text lives on disk under `prompts/`. The compiler (`compilePrompt` in
`cli/src/prompts/compile.ts`) turns the run plan plus those fragments into the single string
handed to a backend. Which fragments are selected is decided upstream by the run plan (see
[prompt-selection.md](./prompt-selection.md)); this document describes how the selected
fragments are assembled.

## Inputs

`compilePrompt(plan, options)` takes a resolved `PromptPlan` and `PromptCompilerOptions`:

| Option                  | Effect                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| `rootDir`               | Repo root used to resolve fragment paths.                                     |
| `projectDir`            | Project whose context digest may be loaded.                                   |
| `includeProjectContext` | When not `false`, a coding run prepends a prior-context digest.               |
| `includeRuntimeContext` | When set, appends the plan variables as an `AIDD_V2_RUNTIME_CONTEXT` comment. |

The plan carries `fragments[]`, each tagged by `kind` (`phase`, `role`, `backend`, …); the
compiler resolves each fragment's `path` at the appropriate assembly step.

## Assembly order

Sections are joined with a `\n\n---\n\n` separator. Empty fragments are skipped.

1. **Base / source prompt** (`compileBasePrompt`), chosen by mode:
    - `interview` → `compileInterviewPrompt`
    - `audit` → `compileAuditPrompt` (with the audit names resolved from the plan)
    - a custom directive (`--prompt` / `--skill`) → `compileDirective`
      (read-only when `customDirectiveReadonly`)
    - otherwise the `phase` fragment; for coding runs a non-empty **project-context digest**
      (`loadProjectContext`) is prepended.
    - `director` mode takes a dedicated path (`compileDirectorPrompt`).
2. **Role wrapper**: the `role` fragment, prepended when present.
3. **Filters**: `applyFilters` narrows by feature / milestone / field selection.
4. **Backend fragment**: `prompts/_cli/{backend}.md`, prepended when present.
5. **Guardrails**: `prompts/_common/hard-constraints.md` then
   `prompts/_common/forbidden-commands.md`, prepended.
6. **Result contract**: the structured completion marker from `compileResultContract`,
   appended (see [prompt-selection.md](./prompt-selection.md#result-contracts)).
7. **Runtime context**: only when `includeRuntimeContext` is set, the plan variables are
   appended as an `<!-- AIDD_V2_RUNTIME_CONTEXT … -->` HTML comment.

## Snapshot key

`CompiledPrompt.snapshotKey` identifies a prompt combination:

```text
backend/mode/phase/role        # role is the literal `none` when no role wrapper applies
```

## Snapshot tests

`cli/src/prompts/snapshots/` holds byte-for-byte snapshots for every
`backend × mode` combination (native/claude-code/opencode/kilocode/codex × coding, todo,
validate, audit, interview, director, directive-mutation, directive-readonly). Regenerate
them in the same change that alters compiler or prompt behavior:

```powershell
bun run prompt:snapshot
```

Snapshots are the safety net for prompt changes: an unexpected diff means a fragment or the
assembly order moved.
