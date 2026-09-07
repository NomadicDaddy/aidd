## CLI: OpenCode

You are running in **OpenCode**, an open-source AI coding assistant.

### Tool Reference

| Operation       | Tool             | Notes                                 |
| --------------- | ---------------- | ------------------------------------- |
| Read file       | `read`           | Read file contents directly           |
| Write file      | `write`          | Create or overwrite file              |
| Edit file       | `edit`           | Apply targeted string changes         |
| Search files    | `glob`           | Find files by pattern                 |
| Search contents | `grep`           | Regex-capable content search          |
| List directory  | `bash` with `ls` | Use shell commands                    |
| Execute command | `bash`           | Shell commands                        |
| Fetch URL       | `webfetch`       | Read web content (text/markdown/html) |
| Launch agent    | `task`           | Specialized agents (general, explore) |
| Todo management | `todowrite`      | Create/manage task lists              |
| Read todo       | `todoread`       | Read task list                        |
| Load skill      | `skill`          | Load skill instructions               |

### Capabilities

**Available:**

- Native file operations (read, write, edit) - highly reliable
- Pattern-based file search (glob) - fast and efficient
- Content search with regex (grep) - powerful code search
- Bash command execution - full shell access
- Web content fetch - documentation lookup
- Task delegation (task) - launch specialized agents for complex tasks
- Todo list management (todowrite, todoread) - track multi-step work
- Skill loading (skill) - load detailed instructions for specific tasks
- Browser automation via `agent-browser` CLI (through bash)

**NOT Available:**

- Native browser_action tools
- attempt_completion tool

### Testing Strategy

**Browser automation IS available via the `agent-browser` CLI, executed through `bash`.** The
step-by-step verification walkthrough, quality gates, and fallback rules live in the workflow
steps below and `/.aidd/_common/testing-requirements.md`; follow those rather than a
backend-specific variant.

### Session Management

- Sessions end naturally when the task is complete
- No `attempt_completion` tool exists
- Simply finish your response when done
- Commit all work before ending

### Best Practices

1. **Prefer native tools over Bash for file operations:**
    - Use `read` not `cat` or `head`
    - Use `edit` not `sed` or `awk`
    - Use `glob` not `find`
    - Use `grep` not `grep` or `rg`

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
    - Use edit for targeted changes (safer)
    - Use write only for new files or complete rewrites
    - Verify edits by reading the file after

5. **If requirements are unclear or contradictory:** follow the Blocking Ambiguity Resolution flow in the hard constraints (document the question in `/.aidd/CHANGELOG.md`, set `waiting_approval`) — there is no user to ask in a headless run.

6. **Use task tool for:**
    - Complex multi-step tasks requiring autonomous agents
    - Codebase exploration and research
    - Open-ended searches requiring multiple rounds

7. **Use todowrite/todoread for:**
    - Complex tasks with 3 or more distinct steps
    - Non-trivial and complex tasks requiring careful planning
    - When user explicitly requests a todo list
    - Tracking progress on multi-feature implementation

### Error Recovery

File-corruption recovery follows `/.aidd/_common/file-integrity.md`; error triage follows
`/.aidd/_common/error-handling-patterns.md`. Git and commit conventions are defined in the
workflow steps below (run git via `bash`).

### Environment Notes

- **Platform:** Detect from the environment rather than assuming. Windows 11 is aidd's verified platform, but projects also run on macOS and Linux.
- **Preferred shell:** On Windows, PowerShell 7.5+ via `pwsh` (bash also works); elsewhere, the platform's default shell.
- **Package manager:** bun preferred when available (check package.json engines)
- **Working directory:** the project directory provided by aidd (use the current working directory)

### Quality Verification

Run the pre-commit quality gate defined in the workflow steps below (`bun run format`,
`bun run lint:fix`, then `bun run smoke:qc` or the project equivalent). **Never commit with
failing quality checks.**
