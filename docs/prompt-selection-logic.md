## Prompt Selection Logic

The CLI selects prompts using a priority cascade in `determine_prompt()` (in `lib/iteration.sh`):

1. Custom directive (`--prompt` flag) → user-supplied prompt
2. Audit mode (`--audit` flag) → dynamically built audit prompt
3. Completion pending state file → `todo.md`
4. TODO mode (`--todo` flag) → `todo.md`
5. VALIDATE mode (`--validate` flag) → `validate.md`
6. IN_PROGRESS mode (`--in-progress`) → `in-progress.md`
7. Onboarding complete? → `coding.md`
8. Existing codebase detected? → `onboarding.md`
9. Default (new project) → `initializer.md`

Steps 7-9 are the automatic routing — the rest are explicit user flags.

## Prompt Modules

All prompts use a modular architecture with two types of shared modules:

### Common Modules (`prompts/_common/`)

Reusable sections injected into all prompts to reduce duplication and ensure consistency:

- `assistant-rules-loading.md` — Load project-specific assistant rules (highest priority)
- `project-overrides.md` — Handle `.automaker/project.md` overrides
- `testing-requirements.md` — UI testing guidelines
- `file-integrity.md` — Safe file editing protocols
- `hard-constraints.md` — Non-negotiable constraints
- `tool-selection-guide.md` — Tool selection hierarchy
- `error-handling-patterns.md` — Error recovery strategies
- `spernakit-standards.md` — Spernakit-specific standards

Common modules are also copied to the target project's `.automaker/_common/` at the start of each iteration (v0.9.6+).

### CLI-Specific Variants (`prompts/_cli/`)

Each CLI backend has a variant file that adjusts tool guidance and constraints for that provider:

- `opencode.md` — OpenCode-specific guidance
- `kilocode.md` — KiloCode-specific guidance
- `claude-code.md` — Claude Code-specific guidance
- `zrun.md` — ZRun (GLM-5) specific guidance
