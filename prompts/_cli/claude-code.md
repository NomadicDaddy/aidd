## CLI: Claude Code

You are running in **Claude Code**, Anthropic's official CLI for Claude.

### Tool Reference

| Operation               | Tool             | Notes                                 |
| ----------------------- | ---------------- | ------------------------------------- |
| Read file               | `Read`           | Native tool, preferred                |
| Write file              | `Write`          | Native tool, preferred                |
| Edit file               | `Edit`           | Native tool, use for targeted changes |
| Search files by pattern | `Glob`           | e.g., `**/*.ts`, `src/**/*.json`      |
| Search file contents    | `Grep`           | Regex-capable, use for finding code   |
| Execute command         | `Bash`           | For git, npm, build commands          |
| List directory          | `Bash` with `ls` | Or use `Glob` with pattern            |
| Web search              | `WebSearch`      | For documentation lookup              |
| Fetch URL               | `WebFetch`       | For reading web content               |

### Capabilities

**Available:**

- Native file operations (Read, Write, Edit) - highly reliable
- Pattern-based file search (Glob) - fast and efficient
- Content search with regex (Grep) - powerful code search
- Bash command execution - full shell access
- Web search and fetch - documentation lookup
- Parallel tool calls - multiple operations at once
- Browser automation via `agent-browser` CLI (through Bash)

### Testing Strategy

**Browser automation IS available via the `agent-browser` CLI, executed through `Bash` as
foreground commands.** The step-by-step verification walkthrough, quality gates, and fallback
rules live in the workflow steps below and `/.aidd/_common/testing-requirements.md`; follow those
rather than a backend-specific variant.

### Session Management

- Sessions end naturally when the task is complete
- No `attempt_completion` tool exists
- Simply finish your response when done
- Commit all work before ending
- **Never end your response while a background task or Monitor is still running.** This is a headless session: ending your turn terminates it immediately, kills all background tasks, and aidd records the iteration as failed (exit 73, missing result). The harness's "you will be notified" messages do not apply here; there is no later turn to notify. Run quality gates (e.g. `bun run smoke:qc`) as foreground blocking Bash commands with an adequate timeout, never via `run_in_background` or Monitor.

### Best Practices

1. **Prefer native tools over Bash for file operations:**
    - Use `Read` not `cat` or `head`
    - Use `Edit` not `sed` or `awk`
    - Use `Glob` not `find`
    - Use `Grep` not `grep` or `rg`

2. **Use Bash only for:**
    - Git operations
    - Package manager commands (npm, bun, pip)
    - Build and test commands
    - System commands

3. **Parallel operations:**
    - Read multiple files in parallel when possible
    - Run independent searches in parallel
    - Improves efficiency significantly

4. **File editing:**
    - Always read a file before editing it
    - Use Edit for targeted changes (safer)
    - Use Write only for new files or complete rewrites
    - Verify edits by reading the file after

### Error Recovery and Quality Gates

File-corruption recovery follows `/.aidd/_common/file-integrity.md`; error triage follows
`/.aidd/_common/error-handling-patterns.md`. Pre-commit quality gates and git/commit conventions
are defined in the workflow steps below — run the gates via `Bash` in the foreground and wait for
them to finish, never backgrounded.
