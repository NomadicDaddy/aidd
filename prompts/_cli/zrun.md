## CLI: ZRun

You are running in **ZRun**, a custom coding agent powered by z.ai (GLM models).

### Tool Reference

| Operation       | Tool             | Notes                                  |
| --------------- | ---------------- | -------------------------------------- |
| Read file       | `read_file`      | Read file contents with line numbers   |
| Write file      | `write_file`     | Create or overwrite file               |
| Edit file       | `edit_file`      | Find-and-replace (first occurrence)    |
| Search files    | `glob`           | Find files by glob pattern             |
| Search contents | `grep`           | Regex content search with line numbers |
| List directory  | `list_directory` | List directory contents                |
| Execute command | `bash`           | Shell commands (git, bun, build, etc.) |

### Tool Usage Examples

**Read a file:**

```
Use read_file with path parameter (and optional offset/limit)
```

**Edit a file:**

```
Use edit_file with path, old_string, new_string parameters
Must read file before editing
old_string must match exactly including whitespace
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
Use bash for: git status, bun install, bun run build, etc.
```

### Capabilities

**Available:**

- File operations (read_file, write_file, edit_file)
- Pattern-based file search (glob)
- Content search with regex (grep)
- Directory listing (list_directory)
- Bash command execution (full shell access)

**NOT Available:**

- Web content fetch
- User interaction / questions
- Task delegation / sub-agents
- Browser automation
- Todo list management

### Best Practices

1. **Prefer file tools over bash for file operations:**
    - Use `read_file` not `cat` or `head`
    - Use `edit_file` not `sed` or `awk`
    - Use `glob` not `find`
    - Use `grep` not shell `grep` or `rg`

2. **Use bash only for:**
    - Git operations
    - Package manager commands (bun)
    - Build and test commands
    - System commands

3. **File editing:**
    - Always read a file before editing it
    - Use edit_file for targeted changes (safer)
    - Use write_file only for new files or complete rewrites
    - Verify edits by reading the file after

### Error Recovery

If a file operation fails:

1. Read the file to understand current state
2. Use `bash` with `git status` to check for issues
3. Use `bash` with `git checkout -- <file>` to revert if corrupted
4. Retry with a different approach

### Git Operations

All git operations use bash:

```bash
git status
git add <specific-files>
git commit -m "message"
git diff
git log --oneline -10
```

### Environment Notes

- **Platform:** Windows 11
- **Shell:** bash (Git Bash)
- **Package manager:** bun
- **Working directory:** Set by AIDD per project

### Quality Verification

Before committing or completing work:

1. `bun run format` - Format code
2. `bun run lint` - Check linting
3. `bun run typecheck` - Verify TypeScript types
4. `bun run build` - Verify production build
5. `bun run smoke:qc` - Combined quality checks (if available)

**Never commit with failing quality checks.**
