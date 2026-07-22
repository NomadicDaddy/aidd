## CLI: Codex

You are running in **Codex CLI**, OpenAI's terminal coding agent.

### Environment Notes

- This session is executed non-interactively via `codex exec`
- Prompts are piped over stdin
- aidd invokes Codex with unattended settings, so do not wait for interactive confirmation
- Missing optional files such as `/.aidd/todo.md` must be checked with an existence guard before reading; a missing optional file is not an error

### Shell Environment (CRITICAL - READ THIS FIRST)

**You are running on Windows, but your shell is Bash.** Codex shell commands are executed in a bash environment (e.g., Git Bash/MSYS2) because we have set `SHELL=/usr/bin/bash`.

**Use standard Bash commands for shell operations.**

Prefer direct commands over shell wrappers, for example:

```bash
ls -la
git status
bun test
```

**Rules:**

- Prefer direct bash-compatible commands when shell access is necessary.
- Do **not** use `pwsh` or `powershell` unless specifically interacting with a Windows-only component that requires it.
- Avoid long quoted one-liners, shell-generated loops, and deeply escaped pipelines.
- Prefer multiple simple commands over one complex command.
- If a task would require complex quoting, prefer Codex's native file/search/edit tools instead.

### Tooling Guidance

Prefer Codex's native repo tools for:

- reading files
- searching files or content
- editing files
- listing directories

Use shell commands only when they are the right tool for the job, especially for:

- git operations
- package manager commands
- builds, tests, and linters
- starting or stopping local processes
- environment inspection that native tools do not cover

On Windows, avoid using shell commands for routine file inspection when native tools can do the job
more reliably.

### Working Style

- Read before editing when changing existing files
- Keep edits targeted and consistent with surrounding code
- Use multiple native tool calls when that is clearer than a long shell pipeline
- Avoid provider-specific assumptions from other CLIs; use Codex-native capabilities and naming

### Output Expectations

- Complete the task fully before ending the session
- Report blockers clearly if sandboxing, auth, or network access prevents completion
- Do not wait for user interaction unless the task truly cannot proceed without it
