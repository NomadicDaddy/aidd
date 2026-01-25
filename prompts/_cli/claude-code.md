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

### Tool Usage Examples

**Read a file:**

```
Use the Read tool with file_path parameter
```

**Edit a file:**

```
Use the Edit tool with file_path, old_string, new_string parameters
```

**Search for files:**

```
Use Glob with pattern like "**/*.tsx" or "src/**/component*.ts"
```

**Search file contents:**

```
Use Grep with pattern like "function handleSubmit" or "TODO:"
```

**Run commands:**

```
Use Bash for: git status, npm install, bun run build, etc.
```

### Capabilities

**Available:**

- Native file operations (Read, Write, Edit) - highly reliable
- Pattern-based file search (Glob) - fast and efficient
- Content search with regex (Grep) - powerful code search
- Bash command execution - full shell access
- Web search and fetch - documentation lookup
- Parallel tool calls - multiple operations at once

**NOT Available:**

- Browser automation (no browser_action tools)
- Screenshot capture
- Direct UI interaction

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

### Error Recovery

If a file operation fails:

1. Read the file to understand current state
2. Use `git status` to check for issues
3. Use `git checkout -- <file>` to revert if corrupted
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
