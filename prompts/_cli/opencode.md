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
| Ask user        | `question`       | Interactive questions                 |
| Launch agent    | `task`           | Specialized agents (general, explore) |
| Todo management | `todowrite`      | Create/manage task lists              |
| Read todo       | `todoread`       | Read task list                        |
| Load skill      | `skill`          | Load skill instructions               |

### Tool Usage Examples

**Read a file:**

```
Use the read tool with filePath parameter
```

**Edit a file:**

```
Use the edit tool with filePath, oldString, newString parameters
Must read file before editing
```

**Search for files:**

```
Use glob with pattern like "**/*.tsx" or "src/**/component*.ts"
```

**Search file contents:**

```
Use grep with pattern like "function handleSubmit" or "TODO:"
```

**Run commands:**

```
Use bash for: git status, npm install, bun run build, etc.
```

**Ask user questions:**

```
Use question tool to gather user preferences, clarify requirements, or get decisions
```

**Launch specialized agent:**

```
Use task tool with subagent_type "general" or "explore"
```

### Capabilities

**Available:**

- Native file operations (read, write, edit) - highly reliable
- Pattern-based file search (glob) - fast and efficient
- Content search with regex (grep) - powerful code search
- Bash command execution - full shell access
- Web content fetch - documentation lookup
- User interaction (question) - gather requirements and decisions
- Task delegation (task) - launch specialized agents for complex tasks
- Todo list management (todowrite, todoread) - track multi-step work
- Skill loading (skill) - load detailed instructions for specific tasks

**NOT Available:**

- Browser automation (no browser_action tools)
- Screenshot capture
- Direct UI interaction
- attempt_completion tool

### Testing Strategy

Since browser automation is not available:

1. **Use terminal-based verification:**
    - Run the application and check console output
    - Use curl/wget for API endpoint testing
    - Check build output for errors

2. **Rely on quality gates:**
    - Lint checks catch UI issues
    - Type checking validates component props
    - Build process catches import/export errors

3. **Manual verification notes:**
    - Document what should be manually tested
    - Provide specific URLs and steps for human verification

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

5. **Use question tool when:**
    - Requirements are unclear or contradictory
    - Multiple valid implementations exist with no clear guidance
    - Spec is missing critical information
    - Technical decision requires human judgment
    - Need user preferences or approval

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

If a file operation fails:

1. Read the file to understand current state
2. Use `bash` with `git status` to check for issues
3. Use `bash` with `git checkout -- <file>` to revert if corrupted
4. Retry with a different approach

### Git Operations

All git operations use Bash:

```bash
git status
git add <specific-files>
git commit -m "message"
git diff
git log --oneline -10
```

### Environment Notes

- **Platform:** Windows 11
- **Preferred shell:** PowerShell 7.5+ (may also use bash)
- **Package manager:** bun preferred when available (check package.json engines)
- **Working directory:** D:\applications\aidd (default, use workdir parameter for other directories)

### Quality Verification

Before committing or completing work, run these commands if available:

1. `bun run format` - Format code
2. `bun run lint` - Check linting
3. `bun run typecheck` - Verify TypeScript types
4. `bun run build` - Verify production build
5. `bun run smoke:qc` - Combined quality checks (if available)

**Never commit with failing quality checks.**
